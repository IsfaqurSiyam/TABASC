const express  = require('express');
const router   = express.Router();
const Product  = require('../models/Product');
const Batch    = require('../models/Batch');
const { protect } = require('./auth');
const {
  web3,
  ProductContract,
  getAccounts,
  getTransactionCost
} = require('../blockchain/web3');

// ── POST /api/products/register ────────────────────────────────────────────
// Farmer registers a new product
router.post('/register', protect, async (req, res) => {
  try {
    const {
      name, description, batchId,
      category, quantity, unit,
      harvestDate, expiryDate
    } = req.body;

    // Only farmers can register products
    if (req.user.role !== 'farmer') {
      return res.status(403).json({ message: 'Only farmers can register products' });
    }

    // Check batch ID is unique
    const exists = await Product.findOne({ batchId });
    if (exists) {
      return res.status(400).json({ message: 'Batch ID already exists' });
    }

    const farmerWallet = req.user.walletAddress;
    if (!web3.utils.isAddress(farmerWallet)) {
      return res.status(400).json({
        message: 'Register a valid wallet address before creating products'
      });
    }

    // Get Ganache accounts
    const accounts = await getAccounts();
    const farmerAccount = accounts[0];

    const contractCode = await web3.eth.getCode(ProductContract.options.address);
    if (!contractCode || contractCode === '0x' || contractCode === '0x0') {
      return res.status(503).json({
        message: 'Product contract is not deployed to the configured Ganache network. Run: npx truffle migrate --reset --network development'
      });
    }

    // Call ProductContract on blockchain
    const tx = await ProductContract.methods
      .registerProduct(name, batchId)
      .send({ from: farmerAccount, gas: 500000 });

    // Web3 v4 receipts do not always expose decoded events.
    const blockchainId = Number(await ProductContract.methods.getProductCount().call());
    const gas = await getTransactionCost(tx.transactionHash);

    // Save to MongoDB
    const product = await Product.create({
      blockchainId:    Number(blockchainId),
      name,
      description,
      batchId,
      category,
      quantity,
      unit:            unit || 'kg',
      farmer:          req.user._id,
      farmerWallet,
      currentOwner:    req.user._id,
      currentStatus:   'Harvested',
      harvestDate,
      expiryDate,
      transactionHash: tx.transactionHash
    });

    // Create a batch record
    await Batch.create({
      batchId,
      farmer:        req.user._id,
      farmerWallet,
      products:      [product._id],
      totalProducts: 1
    });

    res.status(201).json({
      message:   'Product registered successfully',
      product,
      txHash:    tx.transactionHash,
      blockchainId,
      gas
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/products ──────────────────────────────────────────────────────
// Get all products
router.get('/', protect, async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .populate('farmer', 'name email location')
      .populate('currentOwner', 'name email role')
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/products/:id ──────────────────────────────────────────────────
// Get single product by MongoDB ID
router.get('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('farmer', 'name email location phone')
      .populate('currentOwner', 'name email role');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Also get blockchain data
    const blockchainData = await ProductContract.methods
      .getProduct(product.blockchainId)
      .call();

    res.json({ product, blockchainData });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/products/batch/:batchId ──────────────────────────────────────
// Get product by batch ID (used for QR code scan)
router.get('/batch/:batchId', async (req, res) => {
  try {
    const product = await Product.findOne({ batchId: req.params.batchId })
      .populate('farmer', 'name email location phone walletAddress')
      .populate('currentOwner', 'name email role');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/products/farmer/myproducts ───────────────────────────────────
// Get all products for logged in farmer
router.get('/farmer/myproducts', protect, async (req, res) => {
  try {
    const products = await Product.find({
      farmer:   req.user._id,
      isActive: true
    }).sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;