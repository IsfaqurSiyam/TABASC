const express = require('express');
const Product = require('../models/Product');
const User = require('../models/User');
const TrackingEvent = require('../models/TrackingEvent');
const { protect } = require('./auth');
const {
  RoleRegistryContract,
  TrackingContract,
  web3,
  getTransactionCost
} = require('../blockchain/web3');
const { sendFromWallet } = require('../blockchain/wallets');
const { AppError } = require('../middleware/errors');
const { validateRequest } = require('../middleware/requestValidation');
const { assertChainRole } = require('../services/roleAuthorization');
const {
  STATUS_LABELS,
  STATUS_MAP,
  currentChainState,
  isExpired,
  loadEncryptedWallet,
  recordPendingSync,
  requireCustody,
  requireProductDataMatch,
  resolveProduct,
  trackingHash,
  updateProduct
} = require('../services/supplyChain');

const router = express.Router();

const getShipmentEvent = (receipt) => {
  const eventAbi = TrackingContract.options.jsonInterface.find(
    (item) => item.type === 'event' && item.name === 'ShipmentUpdated'
  );
  if (!eventAbi) throw new Error('ShipmentUpdated event is missing from the tracking contract ABI');
  const eventSignature = web3.eth.abi.encodeEventSignature(eventAbi).toLowerCase();
  const eventLog = receipt?.logs?.find(
    (log) => log.topics?.[0]?.toLowerCase() === eventSignature
  );
  if (!eventLog) throw new Error('ShipmentUpdated event was not found in the transaction receipt');
  return web3.eth.abi.decodeLog(
    eventAbi.inputs,
    eventLog.data,
    eventLog.topics.slice(1)
  );
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

const getBlockchainId = (value) => {
  const valueText = String(value);
  const blockchainId = Number(valueText);
  if (!/^\d+$/.test(valueText) || !Number.isSafeInteger(blockchainId) || blockchainId < 1) {
    throw new AppError(400, 'INVALID_BLOCKCHAIN_ID', 'blockchainId must be a positive integer');
  }
  return blockchainId;
};

const getTupleValue = (entry, field, index) =>
  entry[field] === undefined ? entry[index] : entry[field];

router.post('/update', protect, validateRequest({
  body: {
    blockchainId: { required: true, type: 'number', min: 1 },
    status: { required: true, type: 'string', enum: STATUS_LABELS },
    location: { required: true, type: 'string', minLength: 1 },
    notes: { type: 'string' }
  }
}), async (req, res, next) => {
  let receipt;
  try {
    const blockchainId = getBlockchainId(req.body.blockchainId);
    const status = req.body.status;
    const location = req.body.location.trim();
    const notes = (req.body.notes || '').trim();
    if (!location) {
      throw new AppError(400, 'EMPTY_LOCATION', 'Location is required');
    }

    const product = await Product.findOne({ blockchainId, isActive: true });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    const chainState = await currentChainState(blockchainId);
    if (chainState.recalled) {
      throw new AppError(409, 'PRODUCT_RECALLED', 'Recalled products cannot be updated');
    }
    await requireCustody(product, req.user);

    const nextStatusIndex = STATUS_MAP[status];
    if (nextStatusIndex !== chainState.statusIndex + 1) {
      throw new AppError(
        409,
        'INVALID_STATUS_ORDER',
        `Next valid status after ${chainState.status} is ${STATUS_LABELS[chainState.statusIndex + 1] || 'none'}`
      );
    }
    const requiredRole = nextStatusIndex <= STATUS_MAP.Delivered ? 'distributor' : 'retailer';
    if (req.user.role !== requiredRole) {
      throw new AppError(403, 'FORBIDDEN', `Only the current ${requiredRole} can set ${status}`);
    }
    await assertChainRole(RoleRegistryContract, requiredRole, req.user.walletAddress);
    if ((status === 'OnShelf' || status === 'Sold') && isExpired(product.expiryDate)) {
      throw new AppError(409, 'PRODUCT_EXPIRED', 'Expired products cannot be placed on shelf or sold');
    }
    if (status === 'OnShelf' || status === 'Sold') {
      await requireProductDataMatch(product);
    }

    const dataHash = trackingHash(
      blockchainId,
      status,
      location,
      notes,
      req.user.walletAddress
    );
    const method = TrackingContract.methods.updateShipment(
      blockchainId,
      nextStatusIndex,
      location,
      notes,
      dataHash
    );
    const encryptedWallet = await loadEncryptedWallet(req.user._id);
    receipt = await sendFromWallet(encryptedWallet, {
      to: TrackingContract.options.address,
      data: method.encodeABI()
    });

    let event;
    try {
      event = getShipmentEvent(receipt);
    } catch (eventError) {
      return handlePendingSync(res, {
        operation: 'shipment_updated',
        blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          productId: String(product._id),
          status,
          event: {
            eventType: 'shipment_update',
            status,
            actorId: String(req.user._id),
            actorWallet: req.user.walletAddress,
            location,
            notes,
            dataHash
          }
        }
      });
    }

    try {
      const updatedAt = Number(getTupleValue(event, 'timestamp', 6));
      await updateProduct(product._id, {
        $set: { currentStatus: status, transactionHash: receipt.transactionHash }
      });
      await TrackingEvent.create({
        product: product._id,
        blockchainId,
        eventType: 'shipment_update',
        status,
        actor: req.user._id,
        actorWallet: req.user.walletAddress,
        location,
        notes,
        dataHash,
        txHash: receipt.transactionHash,
        time: new Date(updatedAt * 1000)
      });
    } catch (databaseError) {
      return handlePendingSync(res, {
        operation: 'shipment_updated',
        blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          productId: String(product._id),
          status,
          event: {
            eventType: 'shipment_update',
            status,
            actorId: String(req.user._id),
            actorWallet: req.user.walletAddress,
            location,
            notes,
            dataHash
          }
        }
      });
    }

    let gas = null;
    let gasUnavailable = false;
    try {
      gas = await getTransactionCost(receipt.transactionHash);
    } catch (gasError) {
      gasUnavailable = true;
    }
    return res.json({
      message: 'Shipment updated successfully',
      status,
      location,
      txHash: receipt.transactionHash,
      gas,
      gasUnavailable
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/status/:blockchainId', async (req, res, next) => {
  try {
    const blockchainId = getBlockchainId(req.params.blockchainId);
    const product = await Product.findOne({ blockchainId, isActive: true });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    const chainState = await currentChainState(blockchainId);
    return res.json({
      blockchainId,
      currentStatus: chainState.status,
      isRecalled: chainState.recalled,
      expired: isExpired(product.expiryDate)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/buyer', protect, validateRequest({
  params: { id: { required: true, type: 'string' } },
  body: { email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ } }
}), async (req, res, next) => {
  try {
    if (req.user.role !== 'retailer') {
      throw new AppError(403, 'FORBIDDEN', 'Only retailers can record the buyer');
    }
    const product = await resolveProduct(req.params.id);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    if (product.buyer) {
      throw new AppError(409, 'BUYER_ALREADY_RECORDED', 'A buyer has already been recorded');
    }
    const chainState = await currentChainState(product.blockchainId);
    if (chainState.status !== 'Sold') {
      throw new AppError(409, 'PRODUCT_NOT_SOLD', 'A buyer can be recorded only after the product is sold');
    }
    if (chainState.recalled) {
      throw new AppError(409, 'PRODUCT_RECALLED', 'A buyer cannot be recorded for a recalled product');
    }
    await requireCustody(product, req.user);

    const buyer = await User.findOne({
      email: req.body.email.trim().toLowerCase(),
      role: 'consumer',
      isActive: true
    });
    if (!buyer || buyer._id.toString() === req.user._id.toString() ||
        !web3.utils.isAddress(buyer.walletAddress)) {
      throw new AppError(404, 'BUYER_NOT_FOUND', 'An active consumer with that email was not found');
    }
    if (buyer.walletAddress.toLowerCase() === req.user.walletAddress.toLowerCase()) {
      throw new AppError(400, 'INVALID_BUYER', 'Retailer and buyer wallets must be different');
    }
    await assertChainRole(RoleRegistryContract, 'retailer', req.user.walletAddress);
    const method = TrackingContract.methods.recordBuyer(
      product.blockchainId,
      buyer.walletAddress
    );
    const encryptedWallet = await loadEncryptedWallet(req.user._id);
    const receipt = await sendFromWallet(encryptedWallet, {
      to: TrackingContract.options.address,
      data: method.encodeABI()
    });
    try {
      await updateProduct(product._id, {
        $set: { buyer: buyer._id, transactionHash: receipt.transactionHash }
      });
      await TrackingEvent.create({
        product: product._id,
        blockchainId: product.blockchainId,
        eventType: 'buyer_recorded',
        status: 'Sold',
        actor: req.user._id,
        actorWallet: req.user.walletAddress,
        dataHash: product.dataHash,
        txHash: receipt.transactionHash,
        details: { buyerId: String(buyer._id), buyerWallet: buyer.walletAddress }
      });
    } catch (databaseError) {
      return handlePendingSync(res, {
        operation: 'buyer_recorded',
        blockchainId: product.blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          productId: String(product._id),
          buyerId: String(buyer._id),
          buyerWallet: buyer.walletAddress,
          event: {
            eventType: 'buyer_recorded',
            status: 'Sold',
            actorId: String(req.user._id),
            actorWallet: req.user.walletAddress,
            dataHash: product.dataHash,
            details: { buyerId: String(buyer._id), buyerWallet: buyer.walletAddress }
          }
        }
      });
    }
    return res.json({
      message: 'Buyer recorded successfully',
      blockchainId: product.blockchainId,
      buyer: { _id: buyer._id, name: buyer.name, email: buyer.email },
      txHash: receipt.transactionHash
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/recall', protect, validateRequest({
  params: { id: { required: true, type: 'string' } },
  body: { reason: { required: true, type: 'string', minLength: 1 } }
}), async (req, res, next) => {
  try {
    if (req.user.role !== 'inspector') {
      throw new AppError(403, 'FORBIDDEN', 'Only inspectors can recall products');
    }
    await assertChainRole(RoleRegistryContract, 'inspector', req.user.walletAddress);
    const reason = req.body.reason.trim();
    if (!reason) throw new AppError(400, 'EMPTY_RECALL_REASON', 'Recall reason is required');
    const product = await resolveProduct(req.params.id);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    const chainState = await currentChainState(product.blockchainId);
    if (chainState.recalled) {
      throw new AppError(409, 'ALREADY_RECALLED', 'Product has already been recalled');
    }

    const method = TrackingContract.methods.recall(product.blockchainId, reason);
    const encryptedWallet = await loadEncryptedWallet(req.user._id);
    const receipt = await sendFromWallet(encryptedWallet, {
      to: TrackingContract.options.address,
      data: method.encodeABI()
    });
    try {
      await updateProduct(product._id, {
        $set: {
          isRecalled: true,
          recallReason: reason,
          transactionHash: receipt.transactionHash
        }
      });
      await TrackingEvent.create({
        product: product._id,
        blockchainId: product.blockchainId,
        eventType: 'recall',
        status: chainState.status,
        actor: req.user._id,
        actorWallet: req.user.walletAddress,
        dataHash: product.dataHash,
        txHash: receipt.transactionHash,
        details: { reason }
      });
    } catch (databaseError) {
      return handlePendingSync(res, {
        operation: 'product_recalled',
        blockchainId: product.blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          productId: String(product._id),
          reason,
          event: {
            eventType: 'recall',
            status: chainState.status,
            actorId: String(req.user._id),
            actorWallet: req.user.walletAddress,
            dataHash: product.dataHash,
            details: { reason }
          }
        }
      });
    }
    return res.json({
      message: 'Product recalled successfully',
      blockchainId: product.blockchainId,
      reason,
      txHash: receipt.transactionHash
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:blockchainId', async (req, res, next) => {
  try {
    const blockchainId = getBlockchainId(req.params.blockchainId);
    const product = await Product.findOne({ blockchainId, isActive: true });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    const chainHistory = await TrackingContract.methods
      .getHistory(blockchainId)
      .call();
    const history = chainHistory.map((entry) => {
      const status = Number(getTupleValue(entry, 'status', 0));
      const timestamp = Number(getTupleValue(entry, 'timestamp', 5));
      const time = new Date(timestamp * 1000);
      return {
        status: STATUS_LABELS[status],
        location: getTupleValue(entry, 'location', 2),
        notes: getTupleValue(entry, 'notes', 3),
        dataHash: getTupleValue(entry, 'dataHash', 4),
        timestamp: time.toLocaleString(),
        time
      };
    });
    const transferEvents = await TrackingEvent.find({
      blockchainId,
      eventType: { $in: ['handover', 'buyer_recorded', 'recall'] }
    }).sort({ time: 1 });
    const additionalEvents = transferEvents.map((event) => ({
      status: event.eventType,
      location: event.location,
      notes: event.eventType === 'handover'
        ? `Custody transferred to ${event.details?.recipientWallet || ''}`
        : event.eventType === 'recall'
          ? event.details?.reason || ''
          : 'Buyer recorded',
      dataHash: event.dataHash,
      timestamp: event.time.toLocaleString(),
      time: event.time
    }));
    history.push(...additionalEvents);
    history.sort((left, right) => left.time - right.time);

    return res.json({
      blockchainId,
      totalUpdates: history.length,
      history: history.map(({ time, ...entry }) => entry)
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
