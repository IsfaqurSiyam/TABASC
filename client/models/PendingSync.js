const mongoose = require('mongoose');

const PendingSyncSchema = new mongoose.Schema({
  operation: {
    type: String,
    enum: [
      'product_registered',
      'shipment_updated',
      'custody_transferred',
      'buyer_recorded',
      'product_recalled',
      'inspection_recorded',
      'consumer_feedback',
      'reputation_finalized'
    ],
    required: true
  },
  blockchainId: {
    type: Number,
    required: true
  },
  txHash: {
    type: String,
    required: true,
    unique: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'resolved'],
    default: 'pending'
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: 'MongoDB write failed after blockchain transaction'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: {
    type: Date
  }
});

PendingSyncSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('PendingSync', PendingSyncSchema);
