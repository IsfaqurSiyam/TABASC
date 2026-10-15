const mongoose = require('mongoose');

const ReconcileRunSchema = new mongoose.Schema({
  startedAt: {
    type: Date,
    required: true
  },
  completedAt: {
    type: Date,
    required: true
  },
  processed: {
    type: Number,
    required: true
  },
  failed: {
    type: Number,
    required: true
  },
  result: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('ReconcileRun', ReconcileRunSchema);
