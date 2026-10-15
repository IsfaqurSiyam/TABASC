const mongoose = require('mongoose');

const TrackingEventSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  blockchainId: {
    type: Number,
    required: true,
    index: true
  },
  eventType: {
    type: String,
    enum: ['shipment_update', 'handover', 'buyer_recorded', 'recall'],
    required: true
  },
  status: {
    type: String,
    enum: ['Harvested', 'PickedUp', 'InTransit', 'Delivered', 'OnShelf', 'Sold']
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorWallet: {
    type: String,
    required: true
  },
  location: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  dataHash: {
    type: String
  },
  txHash: {
    type: String,
    required: true,
    unique: true
  },
  time: {
    type: Date,
    default: Date.now
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

TrackingEventSchema.index({ blockchainId: 1, time: 1 });

module.exports = mongoose.model('TrackingEvent', TrackingEventSchema);
