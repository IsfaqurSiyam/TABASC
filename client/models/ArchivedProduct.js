const mongoose = require('mongoose');

const ArchivedProductSchema = new mongoose.Schema({
  sourceProductId: {
    type: String,
    required: true,
    unique: true
  },
  sourceBlockchainId: {
    type: Number,
    required: true
  },
  sourceTransactionHash: {
    type: String
  },
  displacedByTransactionHash: {
    type: String,
    default: null
  },
  chainIdAtArchival: {
    type: String,
    required: true
  },
  configuredContractAddress: {
    type: String,
    required: true
  },
  archivedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    required: true
  },
  productSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  batchSnapshots: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  trackingEventSnapshots: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  consumerReviewSnapshots: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  }
});

module.exports = mongoose.model('ArchivedProduct', ArchivedProductSchema);
