const express = require('express');
const QRCode = require('qrcode');
const Product = require('../models/Product');
const Batch = require('../models/Batch');
const User = require('../models/User');
const TrackingEvent = require('../models/TrackingEvent');
const { protect } = require('./auth');
const config = require('../config/env');
const {
  ProductContract,
  RoleRegistryContract,
  TrackingContract,
  web3,
  getTransactionCost
} = require('../blockchain/web3');
const { sendFromWallet } = require('../blockchain/wallets');
const { AppError } = require('../middleware/errors');
const { validateRequest } = require('../middleware/requestValidation');
const { assertChainRole, assertFarmerRole } = require('../services/roleAuthorization');
const {
  STATUS_LABELS,
  STATUS_MAP,
  canonicalProductFields,
  currentChainState,
  deliveryWindowDaysToSeconds,
  hashRecord,
  isExpired,
  loadEncryptedWallet,
  recordPendingSync,
  requireCustody,
  requireProductDataMatch,
  resolveProduct,
  serializePublicProduct,
  serializeProduct,
  updateProduct
} = require('../services/supplyChain');

const router = express.Router();
const categories = ['vegetables', 'fruits', 'grains', 'dairy', 'meat', 'other'];

const getProductRegistrationFromReceipt = (receipt) => {
  const eventAbi = ProductContract.options.jsonInterface.find(
    (item) => item.type === 'event' && item.name === 'ProductRegistered'
  );
  if (!eventAbi) {
    throw new Error('ProductRegistered event is missing from the product contract ABI');
  }

  const eventSignature = web3.eth.abi.encodeEventSignature(eventAbi).toLowerCase();
  const eventLog = receipt?.logs?.find(
    (log) => log.topics?.[0]?.toLowerCase() === eventSignature
  );
  if (!eventLog) {
    throw new Error('ProductRegistered event was not found in the transaction receipt');
  }
  const values = web3.eth.abi.decodeLog(
    eventAbi.inputs,
    eventLog.data,
    eventLog.topics.slice(1)
  );
  const productId = BigInt(values.productId);
  const registeredAt = BigInt(values.registeredAt);
  if (productId === 0n || productId > BigInt(Number.MAX_SAFE_INTEGER) ||
      registeredAt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('ProductRegistered event contained an invalid product id or timestamp');
  }
  return {
    blockchainId: Number(productId),
    registeredAt: Number(registeredAt)
  };
};

const getProductRegistration = async (receipt, batchId) => {
  try {
    return getProductRegistrationFromReceipt(receipt);
  } catch {
    try {
      const productIdValue = BigInt(
        await ProductContract.methods.getProductIdByBatch(batchId).call()
      );
      if (productIdValue === 0n || productIdValue > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Product ID from batch lookup is invalid');
      }
      const blockchainId = Number(productIdValue);
      const registeredAtValue = BigInt(
        await ProductContract.methods.registeredAtOf(blockchainId).call()
      );
      if (registeredAtValue > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Registration timestamp from chain is invalid');
      }
      return { blockchainId, registeredAt: Number(registeredAtValue) };
    } catch {
      throw new AppError(
        502,
        'REGISTRATION_RECEIPT_UNREADABLE',
        `Transaction ${receipt.transactionHash} succeeded, but registration details could not be recovered`
      );
    }
  }
};

const parseDate = (value, field) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new AppError(400, 'INVALID_DATE', `${field} must be a valid date`);
  }
  return date;
};

const getScanUrl = (batchId) =>
  `${config.publicAppUrl}/scan/${encodeURIComponent(batchId)}`;

const parsePage = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addPaginationHeaders = (res, { page, limit, total }) => {
  res.set({
    'X-Page': String(page),
    'X-Limit': String(limit),
    'X-Total-Count': String(total)
  });
};

const buildProductFilter = (req, { farmerOnly = false } = {}) => {
  const filter = { isActive: true };
  if (farmerOnly) {
    filter.farmer = req.user._id;
  } else if (!['admin', 'inspector'].includes(req.user.role)) {
    filter.currentOwner = req.user._id;
  }

  if (req.query.status) {
    if (!STATUS_LABELS.includes(req.query.status)) {
      throw new AppError(400, 'INVALID_STATUS', 'Unknown product status');
    }
    filter.currentStatus = req.query.status;
  }
  if (req.query.category) {
    if (!categories.includes(req.query.category)) {
      throw new AppError(400, 'INVALID_CATEGORY', 'Unknown product category');
    }
    filter.category = req.query.category;
  }
  if (req.query.text) {
    const expression = new RegExp(escapeRegex(String(req.query.text).trim()), 'i');
    filter.$or = [{ name: expression }, { batchId: expression }];
  }
  return filter;
};

const listProducts = async (req, res, next, options = {}) => {
  try {
    const page = parsePage(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePage(req.query.limit, 25, 100);
    const filter = buildProductFilter(req, options);
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('farmer', 'name email location')
        .populate('currentOwner', 'name email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter)
    ]);
    addPaginationHeaders(res, { page, limit, total });
    return res.json(products.map((product) => serializeProduct(product)));
  } catch (error) {
    return next(error);
  }
};

const handlePendingSync = async (res, details) => {
  const pending = await recordPendingSync(details);
  return res.status(202).json({
    message: 'Blockchain transaction succeeded; MongoDB synchronization is pending',
    blockchainId: details.blockchainId,
    txHash: details.txHash,
    pendingSyncId: pending._id
  });
};

router.post('/register', protect, validateRequest({
  body: {
    name: { required: true, type: 'string', minLength: 1, maxLength: 120 },
    batchId: { required: true, type: 'string', minLength: 1, maxLength: 64 },
    category: { type: 'string', enum: categories },
    quantity: { required: true, type: 'number', min: Number.MIN_VALUE },
    unit: { type: 'string', minLength: 1 },
    deliveryWindow: { required: true, type: 'number', min: 1, max: 365 },
    harvestDate: { type: 'string' },
    expiryDate: { type: 'string' },
    description: { type: 'string' }
  }
}), async (req, res, next) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({
      message: 'Only approved farmers can register products',
      code: 'FORBIDDEN'
    });
  }

  let receipt;
  try {
    const name = req.body.name.trim();
    const batchId = req.body.batchId.trim();
    const quantity = Number(req.body.quantity);
    const deliveryWindowDays = Number(req.body.deliveryWindow);
    const unit = (req.body.unit || 'kg').trim();
    const category = req.body.category || 'other';
    const harvestDate = parseDate(req.body.harvestDate, 'harvestDate');
    const expiryDate = parseDate(req.body.expiryDate, 'expiryDate');

    if (!name || !batchId || !unit || !Number.isFinite(quantity) ||
        quantity <= 0 || !Number.isSafeInteger(deliveryWindowDays)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Product fields and delivery window are invalid');
    }
    const deliveryWindow = deliveryWindowDaysToSeconds(deliveryWindowDays);
    if (expiryDate && harvestDate && expiryDate <= harvestDate) {
      throw new AppError(400, 'INVALID_DATE_RANGE', 'Expiry date must be after harvest date');
    }
    if (!web3.utils.isAddress(req.user.walletAddress)) {
      throw new AppError(409, 'INVALID_WALLET', 'Farmer wallet address is invalid');
    }
    await assertFarmerRole(RoleRegistryContract, req.user.walletAddress);
    const nextBlockchainId = BigInt(await ProductContract.methods.productCount().call()) + 1n;
    if (nextBlockchainId > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new AppError(409, 'PRODUCT_ID_LIMIT', 'The next blockchain product ID exceeds the supported range');
    }
    if (await Product.exists({ blockchainId: Number(nextBlockchainId) })) {
      throw new AppError(
        409,
        'CHAIN_ID_COLLISION',
        'The next blockchain product ID is already used by an older MongoDB record. Ask an administrator to reconcile the database with the active chain before registering another product.'
      );
    }
    if (await Product.exists({ batchId })) {
      throw new AppError(409, 'DUPLICATE_BATCH', 'Batch ID already exists');
    }
    if (await Batch.exists({ batchId })) {
      throw new AppError(409, 'BATCH_ALREADY_EXISTS', 'A batch record already exists for this ID');
    }

    const record = {
      name,
      batchId,
      category,
      quantity,
      unit,
      harvestDate,
      expiryDate,
      farmerWallet: req.user.walletAddress,
      deliveryWindow
    };
    const fields = canonicalProductFields(record);
    const dataHash = hashRecord(fields);
    const qrCode = await QRCode.toDataURL(getScanUrl(batchId), {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 400,
      color: { dark: '#1B4332', light: '#FFFFFF' }
    });
    const method = ProductContract.methods.registerProduct(
      name,
      batchId,
      dataHash,
      deliveryWindow
    );
    const encryptedWallet = await loadEncryptedWallet(req.user._id);
    receipt = await sendFromWallet(encryptedWallet, {
      to: ProductContract.options.address,
      data: method.encodeABI()
    });
    const { blockchainId, registeredAt } = await getProductRegistration(receipt, batchId);
    let gas = null;
    let gasUnavailable = false;
    try {
      gas = await getTransactionCost(receipt.transactionHash);
    } catch (gasError) {
      gasUnavailable = true;
    }
    const productData = {
      blockchainId,
      name,
      description: req.body.description,
      batchId,
      category,
      quantity,
      unit,
      farmer: req.user._id,
      farmerWallet: req.user.walletAddress,
      currentOwner: req.user._id,
      currentStatus: 'Harvested',
      deliveryWindow,
      dataHash,
      harvestDate,
      expiryDate,
      qrCode,
      transactionHash: receipt.transactionHash,
      isRecalled: false
    };

    try {
      const product = await Product.create(productData);
      await Batch.create({
        batchId,
        farmer: req.user._id,
        farmerWallet: req.user.walletAddress,
        products: [product._id],
        totalProducts: 1
      });
      await TrackingEvent.create({
        product: product._id,
        blockchainId,
        eventType: 'shipment_update',
        status: 'Harvested',
        actor: req.user._id,
        actorWallet: req.user.walletAddress,
        dataHash,
        txHash: receipt.transactionHash,
        time: new Date(registeredAt * 1000)
      });
      return res.status(201).json({
        message: 'Product registered successfully',
        product: serializeProduct(product),
        txHash: receipt.transactionHash,
        blockchainId,
        gas,
        gasUnavailable
      });
    } catch (databaseError) {
      return handlePendingSync(res, {
        operation: 'product_registered',
        blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          product: {
            ...productData,
            farmer: String(productData.farmer),
            currentOwner: String(productData.currentOwner),
            harvestDate: harvestDate ? harvestDate.toISOString() : null,
            expiryDate: expiryDate ? expiryDate.toISOString() : null
          },
          event: {
            eventType: 'shipment_update',
            status: 'Harvested',
            actorId: String(req.user._id),
            actorWallet: req.user.walletAddress,
            dataHash,
            time: new Date(registeredAt * 1000).toISOString()
          }
        }
      });
    }
  } catch (error) {
    return next(error);
  }
});

router.get('/', protect, (req, res, next) => listProducts(req, res, next));

router.get('/farmer/myproducts', protect, (req, res, next) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ message: 'Farmer access required', code: 'FORBIDDEN' });
  }
  return listProducts(req, res, next, { farmerOnly: true });
});

router.get('/batch/:batchId', async (req, res, next) => {
  try {
    const product = await Product.findOne({ batchId: req.params.batchId })
      .populate('farmer', 'name location');
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    }
    const chainState = await currentChainState(product.blockchainId);
    let verifiedOnChain = false;
    try {
      await requireProductDataMatch(product);
      verifiedOnChain = true;
    } catch (error) {
      if (error.code !== 'PRODUCT_DATA_MISMATCH') throw error;
    }
    return res.json(serializePublicProduct(product, {
      currentStatus: chainState.status,
      isRecalled: chainState.recalled,
      verifiedOnChain
    }));
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/qr', protect, async (req, res, next) => {
  try {
    const product = await resolveProduct(req.params.id);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    const isPrivileged = ['admin', 'inspector'].includes(req.user.role);
    const canView = String(product.farmer) === String(req.user._id) ||
      String(product.currentOwner) === String(req.user._id);
    if (!isPrivileged && !canView) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this product QR code');
    }
    const buffer = await QRCode.toBuffer(getScanUrl(product.batchId), {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 600,
      color: { dark: '#1B4332', light: '#FFFFFF' }
    });
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="tabasc-product-${encodeURIComponent(product.batchId)}.png"`
    });
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/handover', protect, validateRequest({
  params: { id: { required: true, type: 'string' } },
  body: { email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ } }
}), async (req, res, next) => {
  try {
    const product = await resolveProduct(req.params.id);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');

    const chainState = await currentChainState(product.blockchainId);
    if (chainState.recalled) {
      throw new AppError(409, 'PRODUCT_RECALLED', 'Recalled products cannot be handed over');
    }
    await requireCustody(product, req.user);
    const expectedRole = chainState.statusIndex === STATUS_MAP.Harvested
      ? 'distributor'
      : chainState.statusIndex === STATUS_MAP.Delivered ? 'retailer' : null;
    if (!expectedRole) {
      throw new AppError(409, 'INVALID_HANDOVER_STATUS', 'Handover is allowed only after Harvested or Delivered');
    }
    if (req.user.role !== (expectedRole === 'distributor' ? 'farmer' : 'distributor')) {
      throw new AppError(403, 'FORBIDDEN', 'Your role cannot hand over this product at its current status');
    }
    const senderRole = expectedRole === 'distributor' ? 'farmer' : 'distributor';
    await assertChainRole(RoleRegistryContract, senderRole, req.user.walletAddress);

    const recipient = await User.findOne({
      email: req.body.email.trim().toLowerCase(),
      role: expectedRole,
      isActive: true
    });
    if (!recipient || !web3.utils.isAddress(recipient.walletAddress)) {
      throw new AppError(404, 'RECIPIENT_NOT_FOUND', `An active ${expectedRole} with that email was not found`);
    }
    await assertChainRole(RoleRegistryContract, expectedRole, recipient.walletAddress);

    const method = TrackingContract.methods.handover(
      product.blockchainId,
      recipient.walletAddress
    );
    const encryptedWallet = await loadEncryptedWallet(req.user._id);
    const receipt = await sendFromWallet(encryptedWallet, {
      to: TrackingContract.options.address,
      data: method.encodeABI()
    });
    try {
      await updateProduct(product._id, {
        $set: {
          currentOwner: recipient._id,
          currentStatus: chainState.status,
          transactionHash: receipt.transactionHash
        }
      });
      await TrackingEvent.create({
        product: product._id,
        blockchainId: product.blockchainId,
        eventType: 'handover',
        status: chainState.status,
        actor: req.user._id,
        actorWallet: req.user.walletAddress,
        dataHash: product.dataHash,
        txHash: receipt.transactionHash,
        details: { from: String(req.user._id), to: String(recipient._id), recipientWallet: recipient.walletAddress }
      });
    } catch (databaseError) {
      return handlePendingSync(res, {
        operation: 'custody_transferred',
        blockchainId: product.blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          productId: String(product._id),
          targetUserId: String(recipient._id),
          targetWallet: recipient.walletAddress,
          currentStatus: chainState.status,
          event: {
            eventType: 'handover',
            status: chainState.status,
            actorId: String(req.user._id),
            actorWallet: req.user.walletAddress,
            dataHash: product.dataHash,
            details: { from: String(req.user._id), to: String(recipient._id), recipientWallet: recipient.walletAddress }
          }
        }
      });
    }
    return res.json({
      message: 'Product handed over successfully',
      blockchainId: product.blockchainId,
      currentOwner: { _id: recipient._id, name: recipient.name, role: recipient.role },
      txHash: receipt.transactionHash
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', protect, async (req, res, next) => {
  try {
    const product = await resolveProduct(req.params.id);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    const isPrivileged = ['admin', 'inspector'].includes(req.user.role);
    const canView = String(product.farmer) === String(req.user._id) ||
      String(product.currentOwner) === String(req.user._id);
    if (!isPrivileged && !canView) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this product');
    }
    const [populatedProduct, blockchainData, chainState] = await Promise.all([
      Product.findById(product._id)
        .populate('farmer', 'name email location phone')
        .populate('currentOwner', 'name email role'),
      ProductContract.methods.getProduct(product.blockchainId).call(),
      currentChainState(product.blockchainId)
    ]);
    return res.json({
      product: serializeProduct(populatedProduct, {
        currentStatus: chainState.status,
        isRecalled: chainState.recalled
      }),
      blockchainData
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
