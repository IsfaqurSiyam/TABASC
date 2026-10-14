const express  = require('express');
const router   = express.Router();
const Batch    = require('../models/Batch');
const User     = require('../models/User');
const ConsumerReview = require('../models/ConsumerReview');
const { protect } = require('./auth');
const {
  web3,
  ReputationContract,
  getAccounts,
  getTransactionCost
} = require('../blockchain/web3');

router.post('/reviews', protect, async (req, res) => {
  try {
    if (req.user.role !== 'consumer') {
      return res.status(403).json({ message: 'Only consumers can submit reviews' });
    }

    const batchId = typeof req.body.batchId === 'string'
      ? req.body.batchId.trim()
      : '';
    const rating = Number(req.body.rating);
    if (!batchId || !Number.isInteger(rating) || rating < 1 || rating > 10) {
      return res.status(400).json({
        message: 'Batch ID is required and rating must be an integer from 1 to 10'
      });
    }

    const batch = await Batch.findOne({ batchId });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const farmer = await User.findById(batch.farmer).select('walletAddress');
    const farmerWallet = farmer?.walletAddress;
    if (!web3.utils.isAddress(farmerWallet)) {
      return res.status(400).json({
        message: 'Farmer must register a valid wallet before receiving reviews'
      });
    }

    let review;
    try {
      review = await ConsumerReview.create({
        consumer: req.user._id,
        farmer:   batch.farmer,
        batch:    batch._id,
        batchId:  batch.batchId,
        rating
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: 'You have already reviewed this batch'
        });
      }
      throw error;
    }

    let tx;
    try {
      const accounts = await getAccounts();
      if (!accounts.length) {
        throw new Error('No blockchain account is available to record the review');
      }
      tx = await ReputationContract.methods
        .recordConsumerReview(
          farmerWallet,
          rating,
          batch.batchId,
          `${req.user._id}:${batch.batchId}`
        )
        .send({ from: accounts[0], gas: 400000 });
    } catch (error) {
      await ConsumerReview.deleteOne({ _id: review._id });
      throw error;
    }

    await ConsumerReview.updateOne(
      { _id: review._id },
      { transactionHash: tx.transactionHash }
    );

    const score = await ReputationContract.methods
      .getReputationScore(farmerWallet)
      .call();
    const trustLevel = await ReputationContract.methods
      .getTrustLevel(farmerWallet)
      .call();
    const reviewCount = await ConsumerReview.countDocuments({ farmer: batch.farmer });
    const averageRating = await ConsumerReview.aggregate([
      { $match: { farmer: batch.farmer } },
      { $group: { _id: null, average: { $avg: '$rating' } } }
    ]);

    await Batch.findByIdAndUpdate(batch._id, {
      feedbackScore:        Number(score.feedbackScore),
      finalReputationScore: Number(score.finalScore),
      trustLevel,
      reputationTxHash:     tx.transactionHash
    });

    res.status(201).json({
      message:       'Review recorded and farmer reputation updated',
      batchId:       batch.batchId,
      feedbackScore: Number(score.feedbackScore),
      averageRating: Number(averageRating[0].average.toFixed(2)),
      reviewCount,
      finalScore:    Number(score.finalScore),
      trustLevel,
      txHash:        tx.transactionHash
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── POST /api/reputation/score ─────────────────────────────────────────────
// Inspector submits scores for a batch
router.post('/score', protect, async (req, res) => {
  try {
    const {
      batchId,
      stakeholderWallet,
      qualityScore,
      deliveryScore,
      complaintScore,
      complianceScore,
      feedbackScore
    } = req.body;

    // Only inspector or admin can submit scores
    if (!['inspector', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        message: 'Only inspectors can submit reputation scores'
      });
    }

    // Validate scores 0-10
    const scores = [
      qualityScore, deliveryScore,
      complaintScore, complianceScore, feedbackScore
    ];
    for (const score of scores) {
      if (score < 0 || score > 10) {
        return res.status(400).json({
          message: 'All scores must be between 0 and 10'
        });
      }
    }

    // Find the batch
    const batch = await Batch.findOne({ batchId });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const accounts = await getAccounts();
    const adminAccount = accounts[0];

    // Call ReputationContract — MFSRS formula runs on-chain
    const tx = await ReputationContract.methods
      .calculateAndUpdateScore(
        stakeholderWallet,
        qualityScore,
        deliveryScore,
        complaintScore,
        complianceScore,
        feedbackScore,
        batchId
      )
      .send({ from: adminAccount, gas: 400000 });
    const gas = await getTransactionCost(tx.transactionHash);

    const updatedScore = await ReputationContract.methods
      .getReputationScore(stakeholderWallet)
      .call();
    const finalScore = Number(updatedScore.finalScore);
    const effectiveFeedbackScore = Number(updatedScore.feedbackScore);
    const trustLevel = await ReputationContract.methods
      .getTrustLevel(stakeholderWallet)
      .call();

    // Update batch in MongoDB
    await Batch.findOneAndUpdate(
      { batchId },
      {
        inspector:            req.user._id,
        qualityScore,
        deliveryScore,
        complaintScore,
        complianceScore,
        feedbackScore:        effectiveFeedbackScore,
        finalReputationScore: finalScore,
        trustLevel,
        reputationTxHash:     tx.transactionHash,
        inspectionStatus:     'inspected',
        inspectionDate:       new Date()
      },
      { new: true }
    );

    res.json({
      message:     'Reputation score submitted successfully',
      batchId,
      scores: {
        quality:    qualityScore,
        delivery:   deliveryScore,
        complaint:  complaintScore,
        compliance: complianceScore,
        feedback:   effectiveFeedbackScore
      },
      finalScore,
      trustLevel,
      txHash: tx.transactionHash,
      gas
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/reputation/:wallet ────────────────────────────────────────────
// Get reputation score for a stakeholder by wallet address
router.get('/:wallet', async (req, res) => {
  try {
    if (!web3.utils.isAddress(req.params.wallet)) {
      return res.status(400).json({ message: 'Invalid wallet address' });
    }

    const storedScore = await ReputationContract.methods
      .reputationScores(req.params.wallet)
      .call();

    const scoreExists = Array.isArray(storedScore)
      ? storedScore[8]
      : storedScore.exists;

    if (scoreExists !== true && scoreExists !== 'true') {
      return res.status(404).json({
        message: 'No reputation record found for this wallet'
      });
    }

    const score = await ReputationContract.methods
      .getReputationScore(req.params.wallet)
      .call();

    const trustLevel = await ReputationContract.methods
      .getTrustLevel(req.params.wallet)
      .call();

    const historyCount = await ReputationContract.methods
      .getHistoryCount(req.params.wallet)
      .call();

    // Get full history
    const history = [];
    for (let i = 0; i < Number(historyCount); i++) {
      const entry = await ReputationContract.methods
        .getHistoryEntry(req.params.wallet, i)
        .call();

      history.push({
       finalScore: Number(entry.finalScore),
        batchId:    entry.batchId,
        timestamp:  new Date(Number(entry.timestamp) * 1000)
          .toLocaleString()
      });
    }

    res.json({
      wallet: req.params.wallet,
      scores: {
        quality:    Number(score.qualityScore),
        delivery:   Number(score.deliveryScore),
        complaint:  Number(score.complaintScore),
        compliance: Number(score.complianceScore),
        feedback:   Number(score.feedbackScore)
      },
      finalScore:   Number(score.finalScore),
      trustLevel,
      totalBatches: Number(score.totalBatches),
      lastUpdated:  new Date(Number(score.lastUpdated) * 1000)
        .toLocaleString(),
      history
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/reputation/batch/:batchId ────────────────────────────────────

// ── GET /api/reputation/batch/:batchId ────────────────────────────────────
// Get reputation scores for a specific batch
router.get('/batch/:batchId', protect, async (req, res) => {
  try {
    const batch = await Batch.findOne({ batchId: req.params.batchId })
      .populate('farmer',    'name email')
      .populate('inspector', 'name email');

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    res.json(batch);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/reputation/leaderboard/top ───────────────────────────────────
// Get top rated stakeholders from MongoDB
router.get('/leaderboard/top', async (req, res) => {
  try {
    const topBatches = await Batch.find({
      inspectionStatus:     'inspected',
      finalReputationScore: { $exists: true }
    })
      .populate('farmer', 'name email location')
      .sort({ finalReputationScore: -1 })
      .limit(10);

    res.json(topBatches);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;