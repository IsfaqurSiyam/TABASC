process.env.PORT = '5000';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/tabasc_test';
process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-thirty-two-characters';
process.env.GANACHE_URL = 'http://127.0.0.1:8545';
process.env.ROLE_REGISTRY_CONTRACT = '0x1111111111111111111111111111111111111111';
process.env.PRODUCT_CONTRACT = '0x2222222222222222222222222222222222222222';
process.env.TRACKING_CONTRACT = '0x3333333333333333333333333333333333333333';
process.env.REPUTATION_CONTRACT = '0x4444444444444444444444444444444444444444';
process.env.WALLET_PASSPHRASE = 'test-wallet-passphrase-of-at-least-thirty-two';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FUND_AMOUNT_ETH = '0.01';
process.env.JWT_EXPIRES_IN = '2h';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');
const { errorHandler } = require('../middleware/errors');
const {
  AGREEMENT_VERSION,
  AGREEMENT_HASH
} = require('../policies/stakeholderAgreement');

const createdUsers = [];
const fundedWallets = [];
const administrator = {
  _id: '64b000000000000000000001',
  role: 'admin',
  isActive: true,
  walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
};
const pendingAccount = {
  _id: '64b000000000000000000002',
  role: 'consumer',
  approvalStatus: 'pending',
  isActive: false,
  walletAddress: '0x2345678901234567890123456789012345678901',
  walletKeystore: {},
  save: async () => {}
};
const UserStub = {
  exists: async () => null,
  findOne: async ({ email }) => createdUsers.find((user) => user.email === email) || null,
  findById: (id) => {
    const user = [administrator, pendingAccount, ...createdUsers]
      .find((candidate) => String(candidate._id) === String(id)) || null;
    return {
      select: async () => user,
      then: (resolve, reject) => Promise.resolve(user).then(resolve, reject)
    };
  },
  create: async (user) => {
    const createdUser = {
      ...user,
      _id: 'test-user-id',
      email: user.email,
      role: user.role,
      requestedRole: user.requestedRole,
      matchPassword: async (password) => password === 'password123'
    };
    createdUsers.push(createdUser);
    return createdUser;
  }
};
const mockModule = (filename, exports) => {
  const mocked = new Module(filename);
  mocked.filename = filename;
  mocked.loaded = true;
  mocked.exports = exports;
  require.cache[filename] = mocked;
};

mockModule(require.resolve('../models/User'), UserStub);
let walletFundingCalls = 0;
mockModule(require.resolve('../blockchain/wallets'), {
  createWallet: async () => ({
    address: '0x1234567890123456789012345678901234567890',
    keystore: {}
  }),
  fundWallet: async (address) => {
    walletFundingCalls += 1;
    fundedWallets.push(address);
    return { transactionHash: '0xfunding' };
  }
});
mockModule(require.resolve('../models/AuditLog'), {
  create: async () => ({})
});
mockModule(require.resolve('../blockchain/web3'), {
  RoleRegistryContract: {
    methods: { isAdmin: () => ({ call: async () => true }) }
  },
  ProductContract: {
    methods: { productCount: () => ({ call: async () => '0' }) }
  },
  ReputationContract: {},
  TrackingContract: {},
  getAccounts: async () => [administrator.walletAddress],
  web3: { utils: { isAddress: () => true } }
});
const { router } = require('../routes/auth');
const { generateToken } = require('../routes/auth');
const adminRouter = require('../routes/admin');

test('registration requires explicit acceptance of the current agreement version', async (t) => {
  createdUsers.length = 0;
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  app.use(errorHandler);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/auth`;

  const termsResponse = await fetch(`${baseUrl}/agreement`);
  const agreement = await termsResponse.json();
  assert.equal(termsResponse.status, 200);
  assert.equal(agreement.version, AGREEMENT_VERSION);
  assert.ok(agreement.terms.length > 0);

  const baseRegistration = {
    name: 'Example stakeholder',
    email: 'stakeholder@example.test',
    password: 'password123'
  };
  const missingAcceptance = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseRegistration)
  });

  test('administrator activation approves pending accounts and controls later access', async (t) => {
    const app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
    app.use(errorHandler);
    const server = app.listen(0);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/admin/users/${pendingAccount._id}/active`;
    const headers = {
      Authorization: `Bearer ${generateToken(administrator._id)}`,
      'Content-Type': 'application/json'
    };

    const approved = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive: true })
    });
    assert.equal(approved.status, 200);
    assert.equal(pendingAccount.approvalStatus, 'approved');
    assert.equal(pendingAccount.isActive, true);
    assert.equal((await approved.json()).fundingTxHash, '0xfunding');
    assert.equal(walletFundingCalls, 1);

    const deactivated = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(deactivated.status, 200);
    assert.equal(pendingAccount.approvalStatus, 'approved');
    assert.equal(pendingAccount.isActive, false);

    const reactivated = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive: true })
    });
    assert.equal(reactivated.status, 200);
    assert.equal(pendingAccount.isActive, true);
    assert.equal(walletFundingCalls, 1);
  });
  assert.equal(missingAcceptance.status, 400);
  assert.equal(createdUsers.length, 0);

  const oldAgreement = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...baseRegistration,
      agreementAccepted: true,
      agreementVersion: 'outdated'
    })
  });
  const oldAgreementBody = await oldAgreement.json();
  assert.equal(oldAgreement.status, 400);
  assert.equal(oldAgreementBody.code, 'AGREEMENT_REQUIRED');
  assert.equal(createdUsers.length, 0);

  const acceptedRegistration = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...baseRegistration,
      agreementAccepted: true,
      agreementVersion: AGREEMENT_VERSION
    })
  });
  const acceptedBody = await acceptedRegistration.json();
  assert.equal(acceptedRegistration.status, 201);
  assert.equal(acceptedBody.agreementVersion, AGREEMENT_VERSION);
  assert.equal(acceptedBody.approvalStatus, 'pending');
  assert.equal(acceptedBody.pendingApproval, true);
  assert.equal(acceptedBody.fundingTxHash, undefined);
  assert.equal(acceptedBody.token, undefined);
  assert.equal(createdUsers.length, 1);
  assert.equal(createdUsers[0].agreementHash, AGREEMENT_HASH);
  assert.ok(createdUsers[0].agreementAcceptedAt instanceof Date);
  assert.equal(createdUsers[0].isActive, false);
  assert.equal(fundedWallets.includes(createdUsers[0].walletAddress), false);

  const login = (password) => fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: baseRegistration.email, password })
  });
  const pendingLogin = await login('password123');
  const pendingLoginBody = await pendingLogin.json();
  assert.equal(pendingLogin.status, 403);
  assert.equal(pendingLoginBody.code, 'ACCOUNT_PENDING');

  const invalidPasswordLogin = await login('wrong-password');
  assert.equal(invalidPasswordLogin.status, 401);

  createdUsers[0].approvalStatus = 'approved';
  createdUsers[0].isActive = true;
  const approvedLogin = await login('password123');
  assert.equal(approvedLogin.status, 200);

  createdUsers[0].isActive = false;
  const deactivatedLogin = await login('password123');
  const deactivatedLoginBody = await deactivatedLogin.json();
  assert.equal(deactivatedLogin.status, 403);
  assert.equal(deactivatedLoginBody.code, 'ACCOUNT_INACTIVE');
});
