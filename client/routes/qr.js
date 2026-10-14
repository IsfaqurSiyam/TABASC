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

router.post('/generate', protect, async (req, res) => {
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
    res.status(500).json({ message: 'Error generating QR code', error: error.message });
  }
});

router.get('/download/:walletAddress', protect, async (req, res) => {
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
    res.status(500).json({ message: 'Error downloading QR code', error: error.message });
  }
});

router.get('/seller/:walletAddress', async (req, res) => {
  try {
    const user = await User.findOne({ walletAddress: req.params.walletAddress })
      .select('name role walletAddress location isActive');
    if (!user) return res.status(404).json({ message: 'Seller not found' });
    res.json({ seller: user });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching seller information', error: error.message });
  }
});

module.exports = router;
