const mongoose = require('mongoose');

const BatchReputationScoreSchema = new mongoose.Schema({
  batchId: {
    type: String,
    required: true
  },
  blockchainId: {
    type: Number,
    required: true
  },
  stakeholderWallet: {
    type: String,
    required: true,
    lowercase: true
  },
  scoreBps: {
    type: Number,
    required: true,
    min: 0,
    max: 10000
  },
  finalScore: {
    type: Number,
    required: true
  },
  trustLevel: {
    type: String,
    required: true
  },
  totalBatches: {
    type: Number,
    required: true
  },
  transactionHash: {
    type: String,
    required: true
  },
  finalizedAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

BatchReputationScoreSchema.index(
  { batchId: 1, stakeholderWallet: 1 },
  { unique: true }
);
BatchReputationScoreSchema.index({ scoreBps: -1, finalizedAt: -1 });

module.exports = mongoose.model('BatchReputationScore', BatchReputationScoreSchema);
