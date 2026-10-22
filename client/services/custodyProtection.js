const { AppError } = require('../middleware/errors');

const getActiveCustodyProductIds = async (walletAddress, productContract, trackingContract) => {
  if (typeof walletAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return [];
  }
  const productCount = Number(await productContract.methods.productCount().call());
  if (!Number.isSafeInteger(productCount) || productCount < 0) {
    throw new AppError(502, 'INVALID_PRODUCT_COUNT', 'The product contract returned an invalid product count');
  }

  const activeProductIds = [];
  for (let firstId = 1; firstId <= productCount; firstId += 50) {
    const ids = Array.from(
      { length: Math.min(50, productCount - firstId + 1) },
      (_, index) => firstId + index
    );
    const custodians = await Promise.all(ids.map((id) =>
      productContract.methods.custodianOf(id).call()
    ));
    const heldIds = ids.filter((_, index) =>
      custodians[index].toLowerCase() === walletAddress.toLowerCase()
    );
    const statuses = await Promise.all(heldIds.map((id) =>
      trackingContract.methods.getCurrentStatus(id).call()
    ));
    heldIds.forEach((id, index) => {
      if (Number(statuses[index]) !== 5) activeProductIds.push(id);
    });
  }
  return activeProductIds;
};

const assertNoActiveCustody = async (walletAddress, productContract, trackingContract) => {
  const productIds = await getActiveCustodyProductIds(
    walletAddress,
    productContract,
    trackingContract
  );
  if (productIds.length) {
    throw new AppError(
      409,
      'USER_HOLDS_ACTIVE_CUSTODY',
      `This account cannot lose its role or be deactivated while it holds non-final products: ${productIds.join(', ')}`
    );
  }
};

module.exports = { assertNoActiveCustody, getActiveCustodyProductIds };
