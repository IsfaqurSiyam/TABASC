const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const PendingSync = require('../models/PendingSync');
const { AppError } = require('../middleware/errors');
const { web3, ProductContract, TrackingContract } = require('../blockchain/web3');

const STATUS_LABELS = ['Harvested', 'PickedUp', 'InTransit', 'Delivered', 'OnShelf', 'Sold'];
const STATUS_MAP = Object.fromEntries(STATUS_LABELS.map((status, index) => [status, index]));

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((sorted, key) => {
    sorted[key] = sortKeys(value[key]);
    return sorted;
  }, {});
};

const canonicalJson = (value) => JSON.stringify(sortKeys(value));
const hashRecord = (value) => web3.utils.keccak256(canonicalJson(value));

const deliveryWindowDaysToSeconds = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new AppError(400, 'INVALID_DELIVERY_WINDOW', 'Delivery window must be from 1 to 365 days');
  }
  return value * 24 * 60 * 60;
};

const canonicalProductFields = (product) => ({
  batchId: String(product.batchId).trim(),
  category: product.category || 'other',
  deliveryWindow: Number(product.deliveryWindow),
  expiryDate: product.expiryDate ? new Date(product.expiryDate).toISOString() : null,
  farmerWallet: String(product.farmerWallet).toLowerCase(),
  harvestDate: product.harvestDate ? new Date(product.harvestDate).toISOString() : null,
  name: String(product.name).trim(),
  quantity: Number(product.quantity),
  unit: product.unit || 'kg'
});

const resolveProduct = async (identifier) => {
  if (typeof identifier !== 'string') {
    throw new AppError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid');
  }
  if (/^[a-fA-F0-9]{24}$/.test(identifier) && mongoose.isValidObjectId(identifier)) {
    const product = await Product.findById(identifier);
    if (product) return product;
  }
  if (/^\d+$/.test(identifier) && Number(identifier) > 0) {
    return Product.findOne({ blockchainId: Number(identifier) });
  }
  return null;
};

const loadEncryptedWallet = async (userId) => {
  const user = await User.findById(userId).select('+walletKeystore');
  if (!user || !user.walletKeystore) {
    throw new AppError(
      409,
      'WALLET_MIGRATION_REQUIRED',
      'This account needs a funded encrypted wallet before it can submit transactions'
    );
  }
  return user.walletKeystore;
};

const requireCustody = async (product, user) => {
  const custodian = await ProductContract.methods
    .custodianOf(product.blockchainId)
    .call();
  if (custodian.toLowerCase() !== String(user.walletAddress).toLowerCase()) {
    throw new AppError(403, 'NOT_CURRENT_CUSTODIAN', 'Only the current on-chain custodian can perform this action');
  }

  if (String(product.currentOwner) !== String(user._id)) {
    await updateProduct(product._id, { $set: { currentOwner: user._id } });
    product.currentOwner = user._id;
  }
  return custodian;
};

const updateProduct = async (productId, update) => {
  const result = await Product.updateOne({ _id: productId }, update);
  if (result.matchedCount !== 1) {
    throw new AppError(409, 'PRODUCT_NOT_FOUND', 'Product disappeared during synchronization');
  }
  return result;
};

const requireProductDataMatch = async (product) => {
  const recomputedHash = hashRecord(canonicalProductFields(product));
  const onChainHash = await ProductContract.methods
    .dataHashOf(product.blockchainId)
    .call();
  if (recomputedHash.toLowerCase() !== onChainHash.toLowerCase()) {
    throw new AppError(409, 'PRODUCT_DATA_MISMATCH', 'Product data does not match its on-chain hash');
  }
  return { recomputedHash, onChainHash };
};

const recordPendingSync = async ({ operation, blockchainId, txHash, payload }) => {
  try {
    return await PendingSync.create({
      operation,
      blockchainId,
      txHash,
      payload
    });
  } catch (error) {
    throw new AppError(
      503,
      'SYNC_RECORD_FAILED',
      `Blockchain transaction ${txHash} succeeded, but its MongoDB sync could not be recorded`
    );
  }
};

const currentChainState = async (blockchainId) => {
  const [status, custodian, recalled] = await Promise.all([
    TrackingContract.methods.getCurrentStatus(blockchainId).call(),
    ProductContract.methods.custodianOf(blockchainId).call(),
    TrackingContract.methods.isRecalled(blockchainId).call()
  ]);
  const index = Number(status);
  if (!Number.isInteger(index) || !STATUS_LABELS[index]) {
    throw new AppError(502, 'INVALID_CHAIN_STATUS', 'The tracking contract returned an invalid product status');
  }
  return {
    status: STATUS_LABELS[index],
    statusIndex: index,
    custodian,
    recalled: recalled === true || recalled === 'true'
  };
};

const isExpired = (expiryDate) => {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  if (!Number.isFinite(expiry.getTime())) return false;
  const expiresAt = Date.UTC(
    expiry.getUTCFullYear(),
    expiry.getUTCMonth(),
    expiry.getUTCDate() + 1
  );
  return Date.now() >= expiresAt;
};

const serializeProduct = (product, extra = {}) => {
  const data = product.toObject();
  delete data.qrCode;
  return {
    ...data,
    expired: isExpired(product.expiryDate),
    ...extra
  };
};

const serializePublicProduct = (product, extra = {}) => {
  const serialized = serializeProduct(product, extra);
  delete serialized.farmerWallet;
  delete serialized.currentOwner;
  const farmer = product.farmer && typeof product.farmer === 'object'
    ? product.farmer
    : null;
  serialized.farmer = farmer
    ? { name: farmer.name, location: farmer.location }
    : null;
  return serialized;
};

const trackingHash = (blockchainId, status, location, notes, actorWallet) => hashRecord({
  actorWallet: actorWallet.toLowerCase(),
  blockchainId: Number(blockchainId),
  location,
  notes,
  status
});

module.exports = {
  STATUS_LABELS,
  STATUS_MAP,
  canonicalJson,
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
  trackingHash,
  updateProduct
};
