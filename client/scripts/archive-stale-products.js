const mongoose = require('mongoose');
const ArchivedProduct = require('../models/ArchivedProduct');
const Batch = require('../models/Batch');
const ConsumerReview = require('../models/ConsumerReview');
const Product = require('../models/Product');
const TrackingEvent = require('../models/TrackingEvent');
const config = require('../config/env');
const connectDB = require('../config/db');
const { ProductContract, contractAddresses, web3 } = require('../blockchain/web3');
const { archiveDisplacedProduct } = require('../services/productRegistrationSync');

const main = async () => {
  await connectDB(config.mongoUri);
  try {
    const [chainProductCount, chainId] = await Promise.all([
      ProductContract.methods.productCount().call(),
      web3.eth.getChainId()
    ]);
    const staleProducts = await Product.find({
      blockchainId: { $gt: Number(chainProductCount) }
    }).sort({ blockchainId: 1 });
    let archived = 0;

    for (const product of staleProducts) {
      await archiveDisplacedProduct({
        existingProduct: product.toObject(),
        pending: null,
        chainId,
        contractAddress: contractAddresses.product,
        reason: `Product ID exceeds active chain product count (${chainProductCount})`,
        models: { ArchivedProduct, Batch, ConsumerReview, Product, TrackingEvent }
      });
      archived += 1;
    }

    console.log(`Archived ${archived} product records absent from the active chain`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(`Stale product archival failed: ${error.message}`);
  process.exitCode = 1;
});
