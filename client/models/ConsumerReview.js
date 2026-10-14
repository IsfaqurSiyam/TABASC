const mongoose = require('mongoose');

const ConsumerReviewSchema = new mongoose.Schema({
  consumer: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true
  },
  farmer: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true
  },
  batch: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Batch',
    required: true
  },
  batchId: {
    type:     String,
    required: true
  },
  rating: {
    type:     Number,
    min:      1,
    max:      10,
    required: true
  },
  transactionHash: {
    type: String
  },
  createdAt: {
    type:    Date,
    default: Date.now
  }
});

ConsumerReviewSchema.index({ consumer: 1, batch: 1 }, { unique: true });

module.exports = mongoose.model('ConsumerReview', ConsumerReviewSchema);