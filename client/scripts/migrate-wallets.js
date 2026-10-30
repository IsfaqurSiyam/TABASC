const mongoose = require('mongoose');
const User = require('../models/User');
const config = require('../config/env');
const connectDB = require('../config/db');
const { createWallet, fundWallet } = require('../blockchain/wallets');

const run = async () => {
  await connectDB(config.mongoUri);
  try {
    const users = await User.find({
      role: { $ne: 'admin' },
      $or: [
        { walletKeystore: { $exists: false } },
        { walletKeystore: null }
      ]
    }).select('+walletKeystore');

    let migrated = 0;
    for (const user of users) {
      const wallet = await createWallet();
      const fundingReceipt = user.isActive && user.approvalStatus === 'approved'
        ? await fundWallet(wallet.address)
        : null;
      if (user.walletAddress &&
          user.walletAddress.toLowerCase() !== wallet.address.toLowerCase()) {
        user.legacyWallet = user.walletAddress;
      }
      user.walletAddress = wallet.address;
      user.walletKeystore = JSON.stringify(wallet.keystore);
      await user.save();
      migrated += 1;
      if (fundingReceipt) {
        console.log(`Funded migrated wallet for user ${user._id}: ${fundingReceipt.transactionHash}`);
      }
    }
    console.log(`Wallet migration completed for ${migrated} users`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`Wallet migration failed: ${error.message}`);
  process.exitCode = 1;
});
