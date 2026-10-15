const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type:     String,
    required: true,
    trim:     true
  },
  email: {
    type:     String,
    required: true,
    unique:   true,
    trim:     true,
    lowercase: true
  },
  password: {
    type:     String,
    required: true
  },
  role: {
    type:     String,
    enum:     ['farmer', 'distributor', 'retailer', 'consumer', 'inspector', 'admin'],
    required: true
  },
  walletAddress: {
    type:   String,
    unique: true,
    sparse: true
  },
  walletKeystore: {
    type: String,
    select: false
  },
  legacyWallet: {
    type: String
  },
  requestedRole: {
    type: String,
    enum: ['farmer', 'distributor', 'retailer', 'inspector'],
    default: null
  },
  phone: {
    type: String
  },
  location: {
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

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);