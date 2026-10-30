const mongoose = require('mongoose');
const User = require('../models/User');
const config = require('../config/env');
const connectDB = require('../config/db');
const { RoleRegistryContract, getAccounts, web3 } = require('../blockchain/web3');

const roleMethods = {
  farmer: 'FARMER_ROLE',
  distributor: 'DISTRIBUTOR_ROLE',
  retailer: 'RETAILER_ROLE',
  inspector: 'INSPECTOR_ROLE',
  admin: 'ADMIN_ROLE'
};

const run = async () => {
  await connectDB(config.mongoUri);
  try {
    const accounts = await getAccounts();
    if (!accounts.length) throw new Error('Ganache has no administrator account');
    const adminWallet = accounts[0];
    const users = await User.find({
      role: { $in: Object.keys(roleMethods) },
      isActive: { $ne: false },
      approvalStatus: { $ne: 'pending' }
    })
      .select('role walletAddress');
    let granted = 0;
    const skippedUsers = [];

    for (const user of users) {
      const methodName = roleMethods[user.role];
      if (!web3.utils.isAddress(user.walletAddress || '')) {
        console.error(
          `Skipping role sync for user ${user._id} (${user.role}): wallet address is missing or invalid`
        );
        skippedUsers.push(user._id);
        continue;
      }
      const role = await RoleRegistryContract.methods[methodName]().call();
      const roleState = await RoleRegistryContract.methods
        .hasRole(role, user.walletAddress)
        .call();
      const hasRole = roleState === true || roleState === 'true';
      if (hasRole) continue;

      await RoleRegistryContract.methods
        .grantRole(role, user.walletAddress)
        .send({ from: adminWallet });
      granted += 1;
    }
    if (skippedUsers.length) {
      console.error(
        `Role sync incomplete; ${granted} grants added and ${skippedUsers.length} users skipped`
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Role sync completed; ${granted} grants added`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`Role sync failed: ${error.message}`);
  process.exitCode = 1;
});
