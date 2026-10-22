const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/env');
const { createWallet } = require('../blockchain/wallets');
const { validateRequest } = require('../middleware/requestValidation');
const {
  AGREEMENT_VERSION,
  AGREEMENT_TERMS,
  AGREEMENT_HASH,
  isAgreementAcceptanceValid
} = require('../policies/stakeholderAgreement');

const router = express.Router();
const requestedRoles = ['farmer', 'distributor', 'retailer', 'inspector'];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generateToken = (id) => jwt.sign(
  { id: String(id) },
  config.jwtSecret,
  { expiresIn: config.jwtExpiresIn }
);

const protect = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'No token provided',
      code: 'UNAUTHORIZED'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(
      authorization.slice('Bearer '.length),
      config.jwtSecret
    );
  } catch (error) {
    return res.status(401).json({
      message: 'Not authorised',
      code: 'UNAUTHORIZED'
    });
  }

  let user;
  try {
    user = await User.findById(decoded.id).select('-password -walletKeystore');
  } catch (error) {
    return next(error);
  }
  if (!user || !user.isActive) {
    return res.status(401).json({
      message: 'Not authorised',
      code: 'UNAUTHORIZED'
    });
  }

  req.user = user;
  return next();
};

const registrationSchema = validateRequest({
  body: {
    name: { required: true, type: 'string', minLength: 1 },
    email: { required: true, type: 'string', pattern: emailPattern },
    password: { required: true, type: 'string', minLength: 8 },
    agreementAccepted: { required: true, type: 'boolean' },
    agreementVersion: { required: true, type: 'string', minLength: 1 },
    requestedRole: { type: 'string', enum: requestedRoles },
    phone: { type: 'string' },
    location: { type: 'string' }
  }
});

router.post('/register', registrationSchema, async (req, res, next) => {
  const name = req.body.name.trim();
  const email = req.body.email.trim().toLowerCase();
  const { password, phone, location } = req.body;
  const requestedRole = req.body.requestedRole || null;

  if (!isAgreementAcceptanceValid(req.body.agreementAccepted, req.body.agreementVersion)) {
    return res.status(400).json({
      message: 'Read and accept the current participation agreement to register',
      code: 'AGREEMENT_REQUIRED'
    });
  }

  if (!name) {
    return res.status(400).json({
      message: 'Name is required',
      code: 'VALIDATION_ERROR'
    });
  }
  if (!/\d/.test(password)) {
    return res.status(400).json({
      message: 'Password must contain at least one digit',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'An account with that email already exists',
        code: 'DUPLICATE_ACCOUNT'
      });
    }
    const wallet = await createWallet();
    const user = await User.create({
      name,
      email,
      password,
      role: 'consumer',
      requestedRole,
      approvalStatus: 'pending',
      isActive: false,
      agreementVersion: AGREEMENT_VERSION,
      agreementHash: AGREEMENT_HASH,
      agreementAcceptedAt: new Date(),
      walletAddress: wallet.address,
      walletKeystore: JSON.stringify(wallet.keystore),
      phone,
      location
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      requestedRole: user.requestedRole,
      approvalStatus: user.approvalStatus,
      agreementVersion: user.agreementVersion,
      agreementAcceptedAt: user.agreementAcceptedAt,
      walletAddress: user.walletAddress,
      pendingApproval: true,
      fundingTxHash: wallet.fundingReceipt.transactionHash
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An account with that email or wallet already exists',
        code: 'DUPLICATE_ACCOUNT'
      });
    }
    return next(error);
  }
});

router.get('/agreement', (req, res) => res.json({
  version: AGREEMENT_VERSION,
  terms: AGREEMENT_TERMS
}));

router.post('/login', validateRequest({
  body: {
    email: { required: true, type: 'string', pattern: emailPattern },
    password: { required: true, type: 'string', minLength: 1 }
  }
}), async (req, res, next) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || !await user.matchPassword(req.body.password)) {
      return res.status(401).json({
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }
    if (user.approvalStatus === 'pending') {
      return res.status(403).json({
        message: 'Your account is awaiting administrator approval',
        code: 'ACCOUNT_PENDING'
      });
    }
    if (!user.isActive) {
      return res.status(403).json({
        message: 'Your account is inactive. Contact an administrator for assistance.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      requestedRole: user.requestedRole,
      approvalStatus: user.approvalStatus || 'approved',
      walletAddress: user.walletAddress,
      token: generateToken(user._id)
    });
  } catch (error) {
    return next(error);
  }
});

const getCurrentUser = (req, res) => res.json(req.user);
router.get('/me', protect, getCurrentUser);
router.get('/profile', protect, getCurrentUser);

router.put('/profile', protect, validateRequest({
  body: {
    name: { type: 'string', minLength: 1 },
    phone: { type: 'string' },
    location: { type: 'string' }
  }
}), async (req, res, next) => {
  const body = req.body || {};
  const updates = {};
  for (const field of ['name', 'phone', 'location']) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = field === 'name' ? body[field].trim() : body[field];
    }
  }
  if (!Object.keys(updates).length || (updates.name !== undefined && !updates.name)) {
    return res.status(400).json({
      message: 'Provide a valid name, phone, or location to update',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -walletKeystore');
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

router.put('/password', protect, validateRequest({
  body: {
    currentPassword: { required: true, type: 'string', minLength: 1 },
    newPassword: { required: true, type: 'string', minLength: 8 }
  }
}), async (req, res, next) => {
  if (!/\d/.test(req.body.newPassword)) {
    return res.status(400).json({
      message: 'Password must contain at least one digit',
      code: 'VALIDATION_ERROR'
    });
  }
  try {
    const user = await User.findById(req.user._id);
    if (!user || !await user.matchPassword(req.body.currentPassword)) {
      return res.status(400).json({
        message: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }
    user.password = req.body.newPassword;
    await user.save();
    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return next(error);
  }
});

module.exports = { router, protect, generateToken };
