const express  = require('express');
const router   = express.Router();
const Product  = require('../models/Product');
const { protect } = require('./auth');
const {
  TrackingContract,
  getAccounts,
  getTransactionCost
} = require('../blockchain/web3');

// Status map matching our Solidity enum
const STATUS_MAP = {
  'Harvested'  : 0,
  'PickedUp'   : 1,
  'InTransit'  : 2,
  'Delivered'  : 3,
  'OnShelf'    : 4,
  'Sold'       : 5
};

// ── POST /api/tracking/update ──────────────────────────────────────────────
// Update shipment status (Distributor, Retailer)
router.post('/update', protect, async (req, res) => {
  try {
    const { blockchainId, status, location, notes } = req.body;

    // Only distributor, retailer, farmer can update
    const allowedRoles = ['farmer', 'distributor', 'retailer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Not authorised to update shipment'
      });
    }

    // Validate status
    if (STATUS_MAP[status] === undefined) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const accounts  = await getAccounts();
    const account   = accounts[0];

    // Call TrackingContract on blockchain
    const tx = await TrackingContract.methods
      .updateShipment(
        blockchainId,
        STATUS_MAP[status],
        location,
        notes || ''
      )
      .send({ from: account, gas: 300000 });
    const gas = await getTransactionCost(tx.transactionHash);

    // Update MongoDB
    await Product.findOneAndUpdate(
      { blockchainId },
      { currentStatus: status },
      { new: true }
    );

    res.json({
      message: 'Shipment updated successfully',
      status,
      location,
      txHash:  tx.transactionHash,
      gas
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/tracking/:blockchainId ───────────────────────────────────────
// Get full tracking history for a product
router.get('/:blockchainId', async (req, res) => {
  try {
    const { blockchainId } = req.params;

    // Get update count from blockchain
    const count = await TrackingContract.methods
      .getUpdateCount(blockchainId)
      .call();

    // Fetch all updates
    const history = [];
    const statusLabels = [
      'Harvested', 'PickedUp', 'InTransit',
      'Delivered', 'OnShelf', 'Sold'
    ];

    for (let i = 0; i < count; i++) {
      const update = await TrackingContract.methods
        .getUpdate(blockchainId, i)
        .call();

      history.push({
        status:    statusLabels[update.status],
        updatedBy: update.updatedBy,
        location:  update.location,
        notes:     update.notes,
        timestamp: new Date(Number(update.timestamp) * 1000)
          .toLocaleString()
      });
    }

    res.json({
      blockchainId,
      totalUpdates: count,
      history
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/tracking/status/:blockchainId ─────────────────────────────────
// Get current status only
router.get('/status/:blockchainId', async (req, res) => {
  try {
    const statusLabels = [
      'Harvested', 'PickedUp', 'InTransit',
      'Delivered', 'OnShelf', 'Sold'
    ];

    const status = await TrackingContract.methods
      .getCurrentStatus(req.params.blockchainId)
      .call();

    res.json({
      blockchainId: req.params.blockchainId,
      currentStatus: statusLabels[status]
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;