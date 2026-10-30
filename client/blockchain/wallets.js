const config = require('../config/env');
const { web3, getAccounts } = require('./web3');
const { AppError } = require('../middleware/errors');

const transactionQueues = new Map();
const revertResponses = {
  Unauthorized: [403, 'BLOCKCHAIN_UNAUTHORIZED', 'This wallet is not authorized for the requested blockchain action'],
  ProductNotFound: [404, 'PRODUCT_NOT_FOUND', 'Product was not found on the blockchain'],
  ProductRecalled: [409, 'PRODUCT_RECALLED', 'Recalled products cannot be changed or scored'],
  DuplicateBatch: [409, 'DUPLICATE_BATCH', 'That batch ID already exists on the blockchain'],
  InvalidRecipientRole: [403, 'RECIPIENT_ROLE_REQUIRED', 'The selected recipient does not have the required blockchain role'],
  InvalidNextStatus: [409, 'INVALID_PRODUCT_STATE', 'The product cannot move to that shipment status'],
  InvalidHandoverStatus: [409, 'INVALID_PRODUCT_STATE', 'The product cannot be handed over at its current stage'],
  CareAttestationRequired: [400, 'CARE_ATTESTATION_REQUIRED', 'A distributor care attestation is required for retailer handover'],
  CareAttestationAlreadyExists: [409, 'CARE_ATTESTATION_ALREADY_EXISTS', 'A care attestation has already been recorded for this product'],
  EmptyCareExplanation: [400, 'EMPTY_CARE_EXPLANATION', 'Care explanation is required'],
  CareIssueExplanationTooShort: [400, 'CARE_ISSUE_EXPLANATION_TOO_SHORT', 'Explain any failed care checklist item in at least 20 UTF-8 bytes'],
  AlreadyFinalized: [409, 'SCORE_ALREADY_FINALIZED', 'This stakeholder score has already been finalized'],
  ProductNotSold: [409, 'PRODUCT_NOT_SOLD', 'This action requires a sold product'],
  FeedbackWindowOpen: [409, 'FEEDBACK_WINDOW_OPEN', 'Feedback remains open; finalize after feedback is submitted or the 14-day post-sale window ends'],
  FeedbackWindowClosed: [409, 'FEEDBACK_WINDOW_CLOSED', 'The 14-day post-sale feedback window has closed'],
  NotBuyer: [403, 'NOT_RECORDED_BUYER', 'Only the recorded buyer can submit product feedback'],
  AlreadyReviewed: [409, 'FEEDBACK_ALREADY_RECORDED', 'Feedback has already been recorded for this product'],
  InvalidDeliveryWindow: [400, 'INVALID_DELIVERY_WINDOW', 'The delivery window exceeds the maximum allowed duration'],
  InspectionRequired: [409, 'INSPECTION_REQUIRED', 'An inspection is required before finalizing this score'],
  FieldTooLong: [400, 'FIELD_TOO_LONG', 'One or more on-chain text fields exceed their maximum length'],
  SelfInspection: [403, 'SELF_INSPECTION', 'A supply-chain participant cannot inspect their own product']
};
const revertSelectors = new Map(
  Object.keys(revertResponses).map((name) => [
    web3.utils.keccak256(`${name}()`).slice(0, 10).toLowerCase(),
    name
  ])
);

const findRevertData = (value, depth = 0) => {
  if (typeof value === 'string' && /^0x[0-9a-f]{8,}$/i.test(value)) {
    return value;
  }
  if (!value || typeof value !== 'object' || depth >= 5) {
    return null;
  }
  for (const nested of Object.values(value)) {
    const data = findRevertData(nested, depth + 1);
    if (data) return data;
  }
  return null;
};

const mapContractRevert = (error) => {
  const data = findRevertData(error?.data) || findRevertData(error?.cause);
  let revertName = data ? revertSelectors.get(data.slice(0, 10).toLowerCase()) : null;
  if (!revertName) {
    const message = `${error?.message || ''} ${error?.cause?.message || ''}`;
    revertName = Object.keys(revertResponses).find((name) =>
      new RegExp(`\\b${name}\\b`).test(message)
    );
  }
  if (revertName) {
    const [status, code, message] = revertResponses[revertName];
    return new AppError(status, code, message);
  }
  if (error?.code === 310 || error?.name === 'ContractExecutionError' ||
      /execution reverted|vm exception while processing transaction/i.test(error?.message || '')) {
    return new AppError(
      409,
      'BLOCKCHAIN_STATE_CONFLICT',
      'The blockchain rejected this action for the current product state or account permissions'
    );
  }
  return error;
};

const applyGasMargin = (estimate) => (BigInt(estimate) * 120n + 99n) / 100n;

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
      const estimate = await web3.eth.estimateGas({
        from: account.address,
        to: transaction.to,
        data: transaction.data || '0x',
        value: transactionValue
      });
      gas = applyGasMargin(estimate);
    } catch (error) {
      throw mapContractRevert(error);
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
  applyGasMargin,
  mapContractRevert,
  assertSufficientBalance
};
