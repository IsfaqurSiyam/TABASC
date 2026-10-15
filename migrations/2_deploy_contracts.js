const RoleRegistry = artifacts.require("RoleRegistry");
const ProductContract = artifacts.require("ProductContract");
const TrackingContract = artifacts.require("TrackingContract");
const ReputationContract = artifacts.require("ReputationContract");

module.exports = async function (deployer) {
  await deployer.deploy(RoleRegistry);
  const registry = await RoleRegistry.deployed();

  await deployer.deploy(ProductContract, registry.address);
  const product = await ProductContract.deployed();

  await deployer.deploy(TrackingContract, registry.address, product.address);
  const tracking = await TrackingContract.deployed();
  await product.setTrackingContract(tracking.address);

  await deployer.deploy(
    ReputationContract,
    registry.address,
    product.address,
    tracking.address
  );
};
