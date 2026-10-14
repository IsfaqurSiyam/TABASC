const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  // On-chain product ID from ProductContract
  blockchainId: {
    type:     Number,
    required: true,
    unique:   true
  },
  name: {
    type:     String,
    required: true,
    trim:     true
  },
  description: {
    type: String
  },
  batchId: {
    type:     String,
    required: true,
    unique:   true
  },
  category: {
    type: String,
    enum: ['vegetables', 'fruits', 'grains', 'dairy', 'meat', 'other'],
    default: 'other'
  },
  quantity: {
    type:     Number,
    required: true
  },
  unit: {
    type:    String,
    default: 'kg'
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
  currentOwner: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'User'
  },
  currentStatus: {
    type:    String,
    enum:    ['Harvested', 'PickedUp', 'InTransit', 'Delivered', 'OnShelf', 'Sold'],
    default: 'Harvested'
  },
  harvestDate: {
    type: Date
  },
  expiryDate: {
    type: Date
  },
  qrCode: {
    type: String
  },
  transactionHash: {
    type: String
  },
  isActive: {
    type:    Boolean,
    default: true
  },
  createdAt: {
    type:    Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Product', ProductSchema);