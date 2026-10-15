const Web3Package = require('web3');
const Web3 = Web3Package.default || Web3Package;
const config = require('../config/env');

const web3 = new Web3(config.ganacheUrl);
const RoleRegistryABI = require('../../build/contracts/RoleRegistry.json');
const ProductABI = require('../../build/contracts/ProductContract.json');
const TrackingABI = require('../../build/contracts/TrackingContract.json');
const ReputationABI = require('../../build/contracts/ReputationContract.json');

const RoleRegistryContract = new web3.eth.Contract(
  RoleRegistryABI.abi,
  config.contracts.roleRegistry
);
const ProductContract = new web3.eth.Contract(
  ProductABI.abi,
  config.contracts.product
);
const TrackingContract = new web3.eth.Contract(
  TrackingABI.abi,
  config.contracts.tracking
);
const ReputationContract = new web3.eth.Contract(
  ReputationABI.abi,
  config.contracts.reputation
);

const contractAddresses = {
  roleRegistry: config.contracts.roleRegistry,
  product: config.contracts.product,
  tracking: config.contracts.tracking,
  reputation: config.contracts.reputation
};

const getContractCodeStatus = async () => {
  const entries = await Promise.all(
    Object.entries(contractAddresses).map(async ([name, address]) => {
      try {
        const code = await web3.eth.getCode(address);
        return [name, {
          address,
          hasCode: code !== '0x' && code !== '0x0'
        }];
      } catch (error) {
        return [name, { address, hasCode: false, error: true }];
      }
    })
  );
  return Object.fromEntries(entries);
};

const validateContractCode = async () => {
  const statuses = await getContractCodeStatus();
  if (Object.values(statuses).some((status) => status.error)) {
    throw new Error('Unable to connect to Ganache while checking deployed contracts');
  }
  const missingContracts = Object.entries(statuses)
    .filter(([, status]) => !status.hasCode)
    .map(([name]) => name);
  if (missingContracts.length) {
    throw new Error(
      `No contract code found for: ${missingContracts.join(', ')}. Deploy contracts and run sync:env.`
    );
  }
};

const getAccounts = async () => web3.eth.getAccounts();

const getTransactionCost = async (transactionHash) => {
  const receipt = await web3.eth.getTransactionReceipt(transactionHash);
  const transaction = await web3.eth.getTransaction(transactionHash);
  const gasUsed = BigInt(receipt.gasUsed);
  const gasPrice = BigInt(receipt.effectiveGasPrice || transaction.gasPrice);
  const costWei = gasUsed * gasPrice;

  return {
    gasUsed: gasUsed.toString(),
    gasPriceWei: gasPrice.toString(),
    costWei: costWei.toString(),
    costEther: web3.utils.fromWei(costWei.toString(), 'ether')
  };
};

module.exports = {
  web3,
  RoleRegistryContract,
  ProductContract,
  TrackingContract,
  ReputationContract,
  contractAddresses,
  getAccounts,
  getContractCodeStatus,
  getTransactionCost,
  validateContractCode
};
