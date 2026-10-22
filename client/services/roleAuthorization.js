const { AppError } = require('../middleware/errors');

const roleMethods = {
  farmer: 'FARMER_ROLE',
  distributor: 'DISTRIBUTOR_ROLE',
  retailer: 'RETAILER_ROLE',
  inspector: 'INSPECTOR_ROLE'
};

const assertChainRole = async (roleRegistry, role, walletAddress) => {
  const methodName = roleMethods[role];
  if (!methodName) {
    throw new AppError(400, 'INVALID_ROLE', 'Unknown on-chain role');
  }
  if (typeof walletAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new AppError(409, 'INVALID_WALLET', 'A valid wallet address is required for on-chain role checks');
  }
  const roleId = await roleRegistry.methods[methodName]().call();
  const hasRole = await roleRegistry.methods
    .hasRole(roleId, walletAddress)
    .call();
  if (hasRole !== true && hasRole !== 'true') {
    throw new AppError(
      403,
      `${role.toUpperCase()}_ROLE_REQUIRED`,
      `This account does not have the approved ${role} role on the blockchain. Ask an administrator to approve its role request.`
    );
  }
};

const assertFarmerRole = (roleRegistry, walletAddress) => (
  assertChainRole(roleRegistry, 'farmer', walletAddress)
);

module.exports = { assertChainRole, assertFarmerRole };
