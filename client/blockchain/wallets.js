const config = require('../config/env');
const { web3, getAccounts } = require('./web3');
const { AppError } = require('../middleware/errors');

const transactionQueues = new Map();

const assertSufficientBalance = (balance, gas, gasPrice, value = '0') => {
  const requiredBalance = BigInt(gas) * BigInt(gasPrice) + BigInt(value);
  if (BigInt(balance) < requiredBalance) {
    throw new AppError(
      409,
      'INSUFFICIENT_GAS_FUNDS',
      'This wallet does not have enough funds for the estimated transaction fee. Fund it and retry.'
    );
  }
};

const withWalletQueue = async (address, operation) => {
  const key = address.toLowerCase();
  const previous = transactionQueues.get(key) || Promise.resolve();
  const current = previous.then(operation, operation);
  const tail = current.then(() => undefined, () => undefined);
  transactionQueues.set(key, tail);

  try {
    return await current;
  } finally {
    if (transactionQueues.get(key) === tail) {
      transactionQueues.delete(key);
    }
  }
};

const unlockWallet = async (encryptedKeystore, passphrase = config.walletPassphrase) => {
  if (!encryptedKeystore || !passphrase) {
    throw new Error('An encrypted wallet and passphrase are required');
  }
  const keystore = typeof encryptedKeystore === 'string'
    ? JSON.parse(encryptedKeystore)
    : encryptedKeystore;
  return web3.eth.accounts.decrypt(keystore, passphrase);
};

const fundWallet = async (address, amountEth = config.fundAmountEth) => {
  if (!web3.utils.isAddress(address)) {
    throw new Error('A valid wallet address is required');
  }
  const accounts = await getAccounts();
  if (!accounts.length) {
    throw new Error('Ganache has no funding account');
  }

  return withWalletQueue(accounts[0], () => web3.eth.sendTransaction({
    from: accounts[0],
    to: address,
    value: web3.utils.toWei(String(amountEth), 'ether')
  }));
};

const createWallet = async (passphrase = config.walletPassphrase) => {
  const account = web3.eth.accounts.create();
  const keystore = await web3.eth.accounts.encrypt(account.privateKey, passphrase);
  return {
    address: account.address,
    keystore
  };
};

const sendFromWallet = async (encryptedKeystore, transaction, passphrase = config.walletPassphrase) => {
  const account = await unlockWallet(encryptedKeystore, passphrase);
  if (!transaction || !web3.utils.isAddress(transaction.to)) {
    throw new Error('A valid transaction recipient is required');
  }

  return withWalletQueue(account.address, async () => {
    const nonce = await web3.eth.getTransactionCount(account.address, 'pending');
    const chainId = await web3.eth.getChainId();
    const transactionValue = transaction.value || '0';
    let gas;
    try {
      gas = await web3.eth.estimateGas({
        from: account.address,
        to: transaction.to,
        data: transaction.data || '0x',
        value: transactionValue
      });
    } catch (error) {
      if (error.code === 310 || error.name === 'ContractExecutionError') {
        throw new AppError(
          409,
          'BLOCKCHAIN_STATE_CONFLICT',
          'The blockchain rejected this action for the current product state or account permissions'
        );
      }
      throw error;
    }
    const gasPrice = transaction.gasPrice || await web3.eth.getGasPrice();
    const balance = BigInt(await web3.eth.getBalance(account.address));
    assertSufficientBalance(balance, gas, gasPrice, transactionValue);
    const signedTransaction = await web3.eth.accounts.signTransaction({
      to: transaction.to,
      data: transaction.data || '0x',
      value: transactionValue,
      gas,
      gasPrice,
      nonce,
      chainId
    }, account.privateKey);

    if (!signedTransaction.rawTransaction) {
      throw new Error('Wallet could not sign the transaction');
    }
    return web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
  });
};

module.exports = {
  createWallet,
  fundWallet,
  sendFromWallet,
  unlockWallet,
  withWalletQueue,
  assertSufficientBalance
};
