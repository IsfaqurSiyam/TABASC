const mongoose = require('mongoose');
const User = require('../models/User');
const config = require('../config/env');
const connectDB = require('../config/db');
const { RoleRegistryContract, getAccounts } = require('../blockchain/web3');

const run = async () => {
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed an administrator');
  }
  await connectDB(config.mongoUri);
  try {
    const accounts = await getAccounts();
    if (!accounts.length) throw new Error('Ganache has no administrator account');
    const adminWallet = accounts[0];
    const adminRole = await RoleRegistryContract.methods.ADMIN_ROLE().call();
    const roleState = await RoleRegistryContract.methods.isAdmin(adminWallet).call();
    const isAdmin = roleState === true || roleState === 'true';
    if (!isAdmin) {
      await RoleRegistryContract.methods
        .grantRole(adminRole, adminWallet)
        .send({ from: adminWallet });
    }

    const existing = await User.findOne({ email: config.adminEmail });
    if (existing) {
      if (existing.role !== 'admin' ||
          existing.walletAddress.toLowerCase() !== adminWallet.toLowerCase()) {
        throw new Error('Configured admin email is already assigned to another account');
      }
      console.log('Administrator account already seeded');
      return;
    }

    const walletOwner = await User.findOne({ walletAddress: adminWallet.toLowerCase() });
    if (walletOwner) {
      throw new Error('Ganache administrator wallet is already assigned to another user');
    }
    await User.create({
      name: 'Administrator',
      email: config.adminEmail,
      password: config.adminPassword,
      role: 'admin',
      walletAddress: adminWallet,
      isActive: true
    });
    console.log('Administrator account seeded');
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`Admin seeding failed: ${error.message}`);
  process.exitCode = 1;
});
