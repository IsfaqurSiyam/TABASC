const express = require('express');
const QRCode = require('qrcode');
const User = require('../models/User');
const { protect } = require('./auth');

const router = express.Router();
const walletPattern = /^0x[a-fA-F0-9]{40}$/;

const getQrPayload = (walletAddress) => JSON.stringify({
  walletAddress,
  type: 'reputation',
  platform: 'TABASC'
});

router.post('/generate', protect, async (req, res, next) => {
  try {
    const walletAddress = req.body.walletAddress || req.user.walletAddress;
    if (!walletPattern.test(walletAddress || '')) {
      return res.status(400).json({ message: 'Invalid wallet address format' });
    }

    const qrCodeDataUrl = await QRCode.toDataURL(getQrPayload(walletAddress), {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 400,
      color: { dark: '#1B4332', light: '#FFFFFF' }
    });

    res.json({ walletAddress, qrCodeDataUrl });
  } catch (error) {
    return next(error);
  }
});

router.get('/download/:walletAddress', protect, async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    if (!walletPattern.test(walletAddress)) {
      return res.status(400).json({ message: 'Invalid wallet address format' });
    }

    const buffer = await QRCode.toBuffer(getQrPayload(walletAddress), {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 600,
      color: { dark: '#1B4332', light: '#FFFFFF' }
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="tabasc-reputation-${walletAddress}.png"`
    });
    res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/seller/:walletAddress', protect, async (req, res, next) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    if (req.user.role !== 'admin' &&
        req.user.walletAddress.toLowerCase() !== walletAddress) {
      return res.status(403).json({ message: 'You can only view your own seller profile' });
    }
    const user = await User.findOne({ walletAddress })
      .select('name role walletAddress');
    if (!user) return res.status(404).json({ message: 'Seller not found' });
    res.json({ seller: user });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
