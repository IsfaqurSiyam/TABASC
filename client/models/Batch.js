const mongoose = require('mongoose');

const BatchSchema = new mongoose.Schema({
  batchId: {
    type:     String,
    required: true,
    unique:   true
  },
  farmer: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true
  },
  farmerWallet: {
    type:     String,
    required: true
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'Product'
  }],
  totalProducts: {
    type:    Number,
    default: 0
  },

  // Inspector scores for this batch (0-10)
  inspectionStatus: {
    type:    String,
    enum:    ['pending', 'inspected', 'approved', 'rejected'],
    default: 'pending'
  },
  inspector: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User'
  },
  qualityScore: {
    type: Number,
    min:  0,
    max:  10
  },
  deliveryScore: {
    type: Number,
    min:  0,
    max:  10
  },
  complaintScore: {
    type: Number,
    min:  0,
    max:  10
  },
  complianceScore: {
    type: Number,
    min:  0,
    max:  10
  },
  feedbackScore: {
    type: Number,
    min:  0,
    max:  10
  },

  // Final MFSRS score calculated on-chain
  finalReputationScore: {
    type: Number
  },
  trustLevel: {
    type: String
  },
  reputationTxHash: {
    type: String
  },

  inspectionDate: {
    type: Date
  },
  notes: {
    type: String
  },
  createdAt: {
    type:    Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Batch', BatchSchema);