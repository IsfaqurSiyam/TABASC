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
  const salt    = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);