const Web3Package = require('web3');
const Web3 = Web3Package.default || Web3Package;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Connect to Ganache
const web3 = new Web3(process.env.GANACHE_URL);

// Load contract ABIs from build folder
const ProductABI     = require('../../build/contracts/ProductContract.json');
const TrackingABI    = require('../../build/contracts/TrackingContract.json');
const ReputationABI  = require('../../build/contracts/ReputationContract.json');

const defaultNetworkId = '5777';
const resolveContractAddress = (envAddress, contractJson) => {
  if (envAddress && web3.utils.isAddress(envAddress)) {
    return envAddress;
  }

  const network = contractJson.networks?.[defaultNetworkId];
  if (network && web3.utils.isAddress(network.address)) {
    return network.address;
  }

  return null;
};

const ProductContractAddress = resolveContractAddress(
  process.env.PRODUCT_CONTRACT,
  ProductABI
);
const TrackingContractAddress = resolveContractAddress(
  process.env.TRACKING_CONTRACT,
  TrackingABI
);
const ReputationContractAddress = resolveContractAddress(
  process.env.REPUTATION_CONTRACT,
  ReputationABI
);

if (!ProductContractAddress || !TrackingContractAddress || !ReputationContractAddress) {
  throw new Error(
    'Missing or invalid contract address. Set PRODUCT_CONTRACT, TRACKING_CONTRACT, and REPUTATION_CONTRACT in .env, or deploy contracts to network 5777.'
  );
}

// Create contract instances
const ProductContract = new web3.eth.Contract(
  ProductABI.abi,
  ProductContractAddress
);

const TrackingContract = new web3.eth.Contract(
  TrackingABI.abi,
  TrackingContractAddress
);

const ReputationContract = new web3.eth.Contract(
  ReputationABI.abi,
  ReputationContractAddress
);

// Get all available Ganache accounts
const getAccounts = async () => {
  return await web3.eth.getAccounts();
};

const getTransactionCost = async (transactionHash) => {
  const receipt = await web3.eth.getTransactionReceipt(transactionHash);
  const transaction = await web3.eth.getTransaction(transactionHash);
  const gasUsed = BigInt(receipt.gasUsed);
  const gasPrice = BigInt(
    receipt.effectiveGasPrice || transaction.gasPrice
  );
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
  ProductContract,
  TrackingContract,
  ReputationContract,
  getAccounts,
  getTransactionCost
};