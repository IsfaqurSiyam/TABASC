const ProductContract    = artifacts.require("ProductContract");
const TrackingContract   = artifacts.require("TrackingContract");
const ReputationContract = artifacts.require("ReputationContract");

module.exports = function (deployer) {
  deployer.deploy(ProductContract);
  deployer.deploy(TrackingContract);
  deployer.deploy(ReputationContract);
};