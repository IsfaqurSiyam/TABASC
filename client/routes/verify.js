const express = require('express');
const Product = require('../models/Product');
const { ProductContract } = require('../blockchain/web3');
const { AppError } = require('../middleware/errors');
const { canonicalProductFields, hashRecord } = require('../services/supplyChain');

const router = express.Router();

router.get('/:blockchainId', async (req, res, next) => {
  try {
    const idText = req.params.blockchainId;
    const blockchainId = Number(idText);
    if (!/^\d+$/.test(idText) || !Number.isSafeInteger(blockchainId) || blockchainId < 1) {
      throw new AppError(400, 'INVALID_BLOCKCHAIN_ID', 'blockchainId must be a positive integer');
    }

    const product = await Product.findOne({ blockchainId, isActive: true });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');

    const onChainHash = await ProductContract.methods.dataHashOf(blockchainId).call();
    const recomputedHash = hashRecord(canonicalProductFields(product));
    const matches = recomputedHash.toLowerCase() === onChainHash.toLowerCase();

    return res.json({
      blockchainId,
      batchId: product.batchId,
      verified: matches,
      onChainHash,
      recomputedHash,
      productRecord: {
        name: product.name,
        batchId: product.batchId,
        category: product.category,
        quantity: product.quantity,
        unit: product.unit,
        deliveryWindow: product.deliveryWindow,
        harvestDate: product.harvestDate,
        expiryDate: product.expiryDate,
        farmerWallet: product.farmerWallet
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
