const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const PendingSync = require('../models/PendingSync');
const Product = require('../models/Product');
const ReconcileRun = require('../models/ReconcileRun');
const TrackingEvent = require('../models/TrackingEvent');
const config = require('../config/env');
const connectDB = require('../config/db');

const saveTrackingEvent = async (pending, product) => {
  const event = pending.payload.event;
  if (!event) throw new Error(`Pending transaction ${pending.txHash} has no event payload`);
  await TrackingEvent.updateOne(
    { txHash: pending.txHash },
    {
      $setOnInsert: {
        product: product._id,
        blockchainId: pending.blockchainId,
        eventType: event.eventType,
        status: event.status,
        actor: event.actorId,
        actorWallet: event.actorWallet,
        location: event.location || '',
        notes: event.notes || '',
        dataHash: event.dataHash,
        txHash: pending.txHash,
        time: event.time ? new Date(event.time) : new Date(),
        details: event.details || {}
      }
    },
    { upsert: true }
  );
};

const reconcilePending = async (pending) => {
  const { payload } = pending;
  let product;

  if (pending.operation === 'product_registered') {
    if (!payload.product) {
      throw new Error(`Pending transaction ${pending.txHash} has no product payload`);
    }
    product = await Product.findOneAndUpdate(
      { blockchainId: pending.blockchainId },
      { $setOnInsert: payload.product },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await Batch.updateOne(
      { batchId: payload.product.batchId },
      {
        $setOnInsert: {
          batchId: payload.product.batchId,
          farmer: payload.product.farmer,
          farmerWallet: payload.product.farmerWallet
        },
        $addToSet: { products: product._id },
        $max: { totalProducts: 1 }
      },
      { upsert: true }
    );
  } else {
    product = await Product.findOne({ blockchainId: pending.blockchainId });
    if (!product) {
      throw new Error(`Product ${pending.blockchainId} is missing from MongoDB`);
    }

    let fields;
    switch (pending.operation) {
      case 'shipment_updated':
        fields = { currentStatus: payload.status, transactionHash: pending.txHash };
        break;
      case 'custody_transferred':
        fields = {
          currentOwner: payload.targetUserId,
          currentStatus: payload.currentStatus,
          transactionHash: pending.txHash
        };
        break;
      case 'buyer_recorded':
        fields = { buyer: payload.buyerId, transactionHash: pending.txHash };
        break;
      case 'product_recalled':
        fields = {
          isRecalled: true,
          recallReason: payload.reason,
          transactionHash: pending.txHash
        };
        break;
      default:
        throw new Error(`Unsupported pending operation: ${pending.operation}`);
    }
    const update = await Product.updateOne({ _id: product._id }, { $set: fields });
    if (update.matchedCount !== 1) {
      throw new Error(`Product ${pending.blockchainId} disappeared during reconciliation`);
    }
  }

  await saveTrackingEvent(pending, product);
  await PendingSync.updateOne(
    { _id: pending._id, status: 'pending' },
    {
      $set: { status: 'resolved', resolvedAt: new Date(), lastError: '' },
      $inc: { attempts: 1 }
    }
  );
};

const reconcile = async () => {
  const startedAt = new Date();
  const pending = await PendingSync.find({ status: 'pending' }).sort({ createdAt: 1 });
  const failures = [];
  let processed = 0;

  for (const record of pending) {
    try {
      await reconcilePending(record);
      processed += 1;
    } catch (error) {
      const message = String(error.message || 'Unknown reconciliation error').slice(0, 500);
      failures.push({ txHash: record.txHash, error: message });
      await PendingSync.updateOne(
        { _id: record._id, status: 'pending' },
        { $inc: { attempts: 1 }, $set: { lastError: message } }
      );
    }
  }

  const completedAt = new Date();
  const run = await ReconcileRun.create({
    startedAt,
    completedAt,
    processed,
    failed: failures.length,
    result: JSON.stringify({ failures })
  });
  console.log(
    `Reconciliation completed: ${processed} resolved, ${failures.length} failed (run ${run._id})`
  );
  return { processed, failed: failures.length };
};

const main = async () => {
  await connectDB(config.mongoUri);
  try {
    const result = await reconcile();
    if (result.failed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`Reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { reconcile, reconcilePending };
