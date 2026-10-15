const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { validateRequest } = require('../middleware/requestValidation');

// ── Helper: generate JWT token ─────────────────────────────────────────────
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ── Middleware: protect routes ─────────────────────────────────────────────
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
    const token = authorization.slice('Bearer '.length);
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      message: 'Not authorised',
      code: 'UNAUTHORIZED'
    });
  }

  let user;
  try {
    user = await User.findById(decoded.id).select('-password');
  } catch (error) {
    return next(error);
  }
  if (!user) {
    return res.status(401).json({
      message: 'Not authorised',
      code: 'UNAUTHORIZED'
    });
  }
  req.user = user;
  return next();
};

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', validateRequest({
  body: {
    name: { required: true, type: 'string', minLength: 1 },
    email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: { required: true, type: 'string', minLength: 1 }
  }
}), async (req, res) => {
  try {
    const { name, email, password, role, walletAddress, phone, location } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role,
      walletAddress,
      phone,
      location
    });

    res.status(201).json({
      _id:           user._id,
      name:          user.name,
      email:         user.email,
      role:          user.role,
      walletAddress: user.walletAddress,
      token:         generateToken(user._id)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', validateRequest({
  body: {
    email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: { required: true, type: 'string', minLength: 1 }
  }
}), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      _id:           user._id,
      name:          user.name,
      email:         user.email,
      role:          user.role,
      walletAddress: user.walletAddress,
      token:         generateToken(user._id)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/auth/profile ──────────────────────────────────────────────────
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = { router, protect };