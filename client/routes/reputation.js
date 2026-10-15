const express = require('express');
const Batch = require('../models/Batch');
const ConsumerReview = require('../models/ConsumerReview');
const Product = require('../models/Product');
const User = require('../models/User');
const { protect } = require('./auth');
const { AppError } = require('../middleware/errors');
const { validateRequest } = require('../middleware/requestValidation');
const { sendFromWallet } = require('../blockchain/wallets');
const {
  ProductContract,
  ReputationContract,
  TrackingContract,
  web3,
  getTransactionCost
} = require('../blockchain/web3');
const {
  loadEncryptedWallet,
  recordPendingSync
} = require('../services/supplyChain');

const router = express.Router();
const scoreToBps = (value, field) => {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new AppError(400, 'INVALID_SCORE', `${field} must be an integer from 0 to 10`);
  }
  return score * 1000;
};

const asNumber = (tuple, field, index) =>
  Number(tuple[field] === undefined ? tuple[index] : tuple[field]);

const getProduct = async (batchId) => {
  const product = await Product.findOne({ batchId, isActive: true });
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  return product;
};

const getReviewStats = async (farmerId) => {
  const [reviewCount, average] = await Promise.all([
    ConsumerReview.countDocuments({ farmer: farmerId }),
    ConsumerReview.aggregate([
      { $match: { farmer: farmerId } },
      { $group: { _id: null, average: { $avg: '$rating' } } }
    ])
  ]);
  return {
    reviewCount,
    averageRating: average.length ? Number(average[0].average.toFixed(2)) : null
  };
};

const pendingResponse = async (res, data) => {
  const pending = await recordPendingSync(data);
  return res.status(202).json({
    message: 'Blockchain transaction succeeded; MongoDB synchronization is pending',
    blockchainId: data.blockchainId,
    txHash: data.txHash,
    pendingSyncId: pending._id
  });
};

router.get('/participants/:blockchainId', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'inspector') {
      throw new AppError(403, 'FORBIDDEN', 'Only inspectors can view scoring participants');
    }
    const blockchainId = Number(req.params.blockchainId);
    if (!/^\d+$/.test(req.params.blockchainId) ||
        !Number.isSafeInteger(blockchainId) || blockchainId < 1) {
      throw new AppError(400, 'INVALID_BLOCKCHAIN_ID', 'blockchainId must be a positive integer');
    }
    const product = await Product.findOne({ blockchainId, isActive: true });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');

    const candidateEntries = [
      ['farmer', await ProductContract.methods.farmerOf(blockchainId).call()],
      ['distributor', await TrackingContract.methods.actorOf(blockchainId, 1).call()],
      ['retailer', await TrackingContract.methods.actorOf(blockchainId, 4).call()]
    ];
    const seen = new Set();
    const participants = [];
    for (const [role, walletAddress] of candidateEntries) {
      const normalized = walletAddress.toLowerCase();
      if (!/^0x[0-9a-f]{40}$/i.test(walletAddress) ||
          normalized === `0x${'0'.repeat(40)}` || seen.has(normalized)) {
        continue;
      }
      const isParticipant = await ReputationContract.methods
        .isParticipant(blockchainId, walletAddress)
        .call();
      if (!isParticipant) continue;
      seen.add(normalized);
      const account = await User.findOne({
        walletAddress: new RegExp(`^${normalized}$`, 'i')
      }).select('name role');
      participants.push({
        walletAddress,
        role,
        name: account?.name || role
      });
    }
    return res.json({ blockchainId, participants });
  } catch (error) {
    return next(error);
  }
});

router.post('/score', protect, validateRequest({
  body: {
    batchId: { required: true, type: 'string', minLength: 1 },
    stakeholderWallet: { required: true, type: 'string' },
    qualityScore: { required: true, type: 'number', min: 0, max: 10 },
    complianceScore: { required: true, type: 'number', min: 0, max: 10 }
  }
}), async (req, res, next) => {
  try {
    if (req.user.role !== 'inspector') {
      throw new AppError(403, 'FORBIDDEN', 'Only inspectors can submit inspections');
    }
    if (!web3.utils.isAddress(req.body.stakeholderWallet)) {
      throw new AppError(400, 'INVALID_WALLET', 'A valid participant wallet is required');
    }
    const product = await getProduct(req.body.batchId.trim());
    const quality = scoreToBps(req.body.qualityScore, 'qualityScore');
    const compliance = scoreToBps(req.body.complianceScore, 'complianceScore');
    const inspection = await ReputationContract.methods
      .getInspection(product.blockchainId)
      .call();
    let inspectionTxHash = null;

    if (!(inspection.exists === true || inspection.exists === 'true' || inspection[4] === true || inspection[4] === 'true')) {
      const method = ReputationContract.methods.recordInspection(
        product.blockchainId,
        quality,
        compliance
      );
      const encryptedWallet = await loadEncryptedWallet(req.user._id);
      const receipt = await sendFromWallet(encryptedWallet, {
        to: ReputationContract.options.address,
        data: method.encodeABI(),
        gas: 350000
      });
      inspectionTxHash = receipt.transactionHash;
      try {
        const batchUpdate = await Batch.updateOne(
          { batchId: product.batchId },
          {
            $set: {
              inspector: req.user._id,
              qualityScore: req.body.qualityScore,
              complianceScore: req.body.complianceScore,
              inspectionStatus: 'inspected',
              inspectionDate: new Date()
            }
          }
        );
        if (batchUpdate.matchedCount !== 1) {
          throw new Error('Batch record was not found during inspection synchronization');
        }
      } catch (databaseError) {
        return pendingResponse(res, {
          operation: 'inspection_recorded',
          blockchainId: product.blockchainId,
          txHash: inspectionTxHash,
          payload: {
            batchId: product.batchId,
            inspectorId: String(req.user._id),
            qualityScore: req.body.qualityScore,
            complianceScore: req.body.complianceScore
          }
        });
      }
    } else {
      const recordedQuality = asNumber(inspection, 'quality', 0);
      const recordedCompliance = asNumber(inspection, 'compliance', 1);
      if (recordedQuality !== quality || recordedCompliance !== compliance) {
        throw new AppError(409, 'INSPECTION_IMMUTABLE', 'The recorded inspection scores cannot be changed');
      }
    }

    const isParticipant = await ReputationContract.methods
      .isParticipant(product.blockchainId, req.body.stakeholderWallet)
      .call();
    if (!(isParticipant === true || isParticipant === 'true')) {
      throw new AppError(400, 'NOT_A_PARTICIPANT', 'The selected wallet did not participate in this product journey');
    }
    const existingHistory = await ReputationContract.methods
      .getHistory(req.body.stakeholderWallet)
      .call();
    if (existingHistory.some((entry) => entry.batchId === product.batchId)) {
      throw new AppError(409, 'SCORE_ALREADY_FINALIZED', 'This participant already has a finalized score for this product');
    }

    const finalize = ReputationContract.methods.finalizeScore(
      product.blockchainId,
      req.body.stakeholderWallet
    );
    const encryptedWallet = await loadEncryptedWallet(req.user._id);
    const receipt = await sendFromWallet(encryptedWallet, {
      to: ReputationContract.options.address,
      data: finalize.encodeABI(),
      gas: 400000
    });
    const [reputation, trustLevel] = await Promise.all([
      ReputationContract.methods.getReputation(req.body.stakeholderWallet).call(),
      ReputationContract.methods.getTrustLevel(req.body.stakeholderWallet).call()
    ]);
    const scoreBps = asNumber(reputation, 'scoreBps', 0);
    const finalScore = Math.round(scoreBps / 10);
    const totalBatches = asNumber(reputation, 'batches', 1);
    let batchUpdate;
    try {
      batchUpdate = await Batch.updateOne(
        { batchId: product.batchId },
        {
          $set: {
            finalReputationScore: finalScore,
            trustLevel,
            reputationTxHash: receipt.transactionHash
          }
        }
      );
      if (batchUpdate.matchedCount !== 1) {
        throw new Error('Batch record was not found during reputation synchronization');
      }
    } catch (databaseError) {
      return pendingResponse(res, {
        operation: 'reputation_finalized',
        blockchainId: product.blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          batchId: product.batchId,
          stakeholderWallet: req.body.stakeholderWallet,
          finalScore,
          scoreBps,
          totalBatches,
          trustLevel
        }
      });
    }

    let gas = null;
    try {
      gas = await getTransactionCost(receipt.transactionHash);
    } catch (error) {
      gas = null;
    }
    return res.json({
      message: 'Inspection recorded and participant reputation finalized',
      batchId: product.batchId,
      stakeholderWallet: req.body.stakeholderWallet,
      qualityScore: req.body.qualityScore,
      complianceScore: req.body.complianceScore,
      finalScore,
      scoreBps,
      totalBatches,
      trustLevel,
      inspectionTxHash,
      txHash: receipt.transactionHash,
      gas,
      gasUnavailable: gas === null
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/reviews', protect, validateRequest({
  body: {
    batchId: { required: true, type: 'string', minLength: 1 },
    rating: { required: true, type: 'number', min: 1, max: 10 }
  }
}), async (req, res, next) => {
  try {
    if (req.user.role !== 'consumer') {
      throw new AppError(403, 'FORBIDDEN', 'Only consumers can submit product feedback');
    }
    if (!Number.isInteger(req.body.rating)) {
      throw new AppError(400, 'INVALID_RATING', 'Rating must be an integer from 1 to 10');
    }
    const product = await getProduct(req.body.batchId.trim());
    const [status, recalled] = await Promise.all([
      TrackingContract.methods.getCurrentStatus(product.blockchainId).call(),
      TrackingContract.methods.isRecalled(product.blockchainId).call()
    ]);
    if (Number(status) !== 5) {
      throw new AppError(409, 'PRODUCT_NOT_SOLD', 'Feedback can be submitted only for a sold product');
    }
    if (recalled === true || recalled === 'true') {
      throw new AppError(409, 'PRODUCT_RECALLED', 'Feedback cannot be submitted for a recalled product');
    }
    let buyer;
    try {
      buyer = await TrackingContract.methods.buyerOf(product.blockchainId).call();
    } catch {
      throw new AppError(409, 'BUYER_NOT_RECORDED', 'The retailer has not recorded a buyer for this product');
    }
    if (buyer.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      throw new AppError(403, 'NOT_RECORDED_BUYER', 'Only the recorded buyer can submit product feedback');
    }
    const existingFeedback = await ReputationContract.methods
      .getFeedback(product.blockchainId)
      .call();
    if (existingFeedback.exists === true || existingFeedback.exists === 'true' ||
        existingFeedback[4] === true || existingFeedback[4] === 'true') {
      throw new AppError(409, 'FEEDBACK_ALREADY_RECORDED', 'Feedback has already been submitted for this product');
    }

    const satisfaction = req.body.rating * 1000;
    const complaint = (10 - req.body.rating) * 1000;
    const method = ReputationContract.methods.submitFeedback(
      product.blockchainId,
      complaint,
      satisfaction
    );
    const encryptedWallet = await loadEncryptedWallet(req.user._id);
    const receipt = await sendFromWallet(encryptedWallet, {
      to: ReputationContract.options.address,
      data: method.encodeABI(),
      gas: 300000
    });

    try {
      const batch = await Batch.findOne({ batchId: product.batchId }).select('_id');
      if (!batch) throw new Error('Batch record was not found during feedback synchronization');
      await ConsumerReview.updateOne(
        { consumer: req.user._id, batch: batch._id },
        {
          $setOnInsert: {
            consumer: req.user._id,
            farmer: product.farmer,
            batch: batch._id,
            batchId: product.batchId,
            rating: req.body.rating,
            transactionHash: receipt.transactionHash
          }
        },
        { upsert: true }
      );
      const batchUpdate = await Batch.updateOne(
        { batchId: product.batchId },
        {
          $set: {
            feedbackScore: req.body.rating,
            complaintScore: 10 - req.body.rating
          }
        }
      );
      if (batchUpdate.matchedCount !== 1) {
        throw new Error('Batch record was not found during feedback synchronization');
      }
    } catch (databaseError) {
      return pendingResponse(res, {
        operation: 'consumer_feedback',
        blockchainId: product.blockchainId,
        txHash: receipt.transactionHash,
        payload: {
          batchId: product.batchId,
          consumerId: String(req.user._id),
          farmerId: String(product.farmer),
          rating: req.body.rating
        }
      });
    }

    const { reviewCount, averageRating } = await getReviewStats(product.farmer);
    let gas = null;
    try {
      gas = await getTransactionCost(receipt.transactionHash);
    } catch (error) {
      gas = null;
    }
    return res.status(201).json({
      message: 'Product feedback recorded on-chain',
      batchId: product.batchId,
      rating: req.body.rating,
      averageRating,
      reviewCount,
      txHash: receipt.transactionHash,
      gas,
      gasUnavailable: gas === null
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/batch/:batchId', protect, async (req, res, next) => {
  try {
    const batch = await Batch.findOne({ batchId: req.params.batchId })
      .populate('farmer', 'name email')
      .populate('inspector', 'name email');
    if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'Batch not found');
    return res.json(batch);
  } catch (error) {
    return next(error);
  }
});

router.get('/leaderboard/top', async (req, res, next) => {
  try {
    const topBatches = await Batch.find({
      inspectionStatus: 'inspected',
      finalReputationScore: { $exists: true }
    })
      .populate('farmer', 'name email location')
      .sort({ finalReputationScore: -1 })
      .limit(10);
    return res.json(topBatches);
  } catch (error) {
    return next(error);
  }
});

router.get('/:wallet', async (req, res, next) => {
  try {
    if (!web3.utils.isAddress(req.params.wallet)) {
      throw new AppError(400, 'INVALID_WALLET', 'Invalid wallet address');
    }
    const [reputation, trustLevel, history] = await Promise.all([
      ReputationContract.methods.getReputation(req.params.wallet).call(),
      ReputationContract.methods.getTrustLevel(req.params.wallet).call(),
      ReputationContract.methods.getHistory(req.params.wallet).call()
    ]);
    const scoreBps = asNumber(reputation, 'scoreBps', 0);
    const batches = asNumber(reputation, 'batches', 1);
    const exists = reputation.exists === true || reputation.exists === 'true' ||
      reputation[2] === true || reputation[2] === 'true';
    if (!exists) {
      throw new AppError(404, 'REPUTATION_NOT_FOUND', 'No reputation record found for this wallet');
    }
    const batchHistory = await Batch.find({
      batchId: { $in: history.map((entry) => entry.batchId) }
    }).select('batchId qualityScore deliveryScore complaintScore complianceScore feedbackScore');
    const scoresByBatch = new Map(batchHistory.map((batch) => [batch.batchId, batch]));

    return res.json({
      wallet: req.params.wallet,
      scores: {
        quality: null,
        delivery: null,
        complaint: null,
        compliance: null,
        feedback: null
      },
      finalScore: Math.round(scoreBps / 10),
      scoreBps,
      trustLevel,
      totalBatches: batches,
      lastUpdated: history.length
        ? new Date(Number(history[history.length - 1].timestamp) * 1000).toLocaleString()
        : null,
      history: history.map((entry) => {
        const batch = scoresByBatch.get(entry.batchId);
        return {
          finalScore: Math.round(Number(entry.scoreBps) / 10),
          scoreBps: Number(entry.scoreBps),
          batchId: entry.batchId,
          timestamp: new Date(Number(entry.timestamp) * 1000).toLocaleString(),
          scores: batch ? {
            quality: batch.qualityScore,
            delivery: batch.deliveryScore,
            complaint: batch.complaintScore,
            compliance: batch.complianceScore,
            feedback: batch.feedbackScore
          } : null
        };
      })
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
