const mongoose = require('mongoose');
const User = require('../models/User');
const config = require('../config/env');
const connectDB = require('../config/db');
const { RoleRegistryContract, getAccounts } = require('../blockchain/web3');

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
    const users = await User.find({ role: { $in: Object.keys(roleMethods) } })
      .select('role walletAddress');
    let granted = 0;

    for (const user of users) {
      const methodName = roleMethods[user.role];
      if (!user.walletAddress) {
        throw new Error(`User with role ${user.role} has no wallet address`);
      }
      const role = await RoleRegistryContract.methods[methodName]().call();
      const roleState = await RoleRegistryContract.methods
        .hasRole(role, user.walletAddress)
        .call();
      const hasRole = roleState === true || roleState === 'true';
      if (hasRole) continue;

      await RoleRegistryContract.methods
        .grantRole(role, user.walletAddress)
        .send({ from: adminWallet, gas: 200000 });
      granted += 1;
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
