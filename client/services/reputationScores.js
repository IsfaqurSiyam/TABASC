const {
  ReputationContract,
  web3
} = require('../blockchain/web3');

const getFinalizedBatchScore = (receipt, blockchainId, stakeholderWallet) => {
  const eventAbi = ReputationContract.options.jsonInterface.find(
    (item) => item.type === 'event' && item.name === 'ReputationFinalized'
  );
  if (!eventAbi) {
    throw new Error('ReputationFinalized event is missing from the reputation contract ABI');
  }

  const eventSignature = web3.eth.abi.encodeEventSignature(eventAbi).toLowerCase();
  const eventLog = receipt?.logs?.find(
    (log) => log.topics?.[0]?.toLowerCase() === eventSignature
  );
  if (!eventLog) {
    throw new Error('ReputationFinalized event was not found in the transaction receipt');
  }

  const values = web3.eth.abi.decodeLog(
    eventAbi.inputs,
    eventLog.data,
    eventLog.topics.slice(1)
  );
  if (Number(values.productId) !== Number(blockchainId) ||
      values.stakeholder.toLowerCase() !== stakeholderWallet.toLowerCase()) {
    throw new Error('ReputationFinalized event does not match the requested batch and stakeholder');
  }
  return Number(values.batchScore);
};

const saveBatchReputationScore = (Score, record) => {
  const stakeholderWallet = record.stakeholderWallet.toLowerCase();
  return Score.updateOne(
    { batchId: record.batchId, stakeholderWallet },
    { $set: { ...record, stakeholderWallet } },
    { upsert: true }
  );
};

module.exports = { getFinalizedBatchScore, saveBatchReputationScore };
