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
const { validateEnvironment } = require('../config/env');
const {
  AGREEMENT_VERSION,
  AGREEMENT_TERMS,
  AGREEMENT_HASH,
  isAgreementAcceptanceValid
} = require('../policies/stakeholderAgreement');
const {
  canonicalJson,
  canonicalProductFields,
  deliveryWindowDaysToSeconds,
  hashRecord,
  isExpired,
  trackingHash
} = require('../services/supplyChain');
const { assertChainRole, assertFarmerRole } = require('../services/roleAuthorization');
const { assertSufficientBalance } = require('../blockchain/wallets');
const {
  archiveDisplacedProduct,
  assertProductRegistrationTarget
} = require('../services/productRegistrationSync');

test('admin seeding credentials are optional for backend startup', () => {
  const environment = { ...process.env };
  delete environment.ADMIN_EMAIL;
  delete environment.ADMIN_PASSWORD;
  assert.doesNotThrow(() => validateEnvironment(environment));
});

test('product registration requires the farmer role on the active chain', async () => {
  const roleRegistry = {
    methods: {
      FARMER_ROLE: () => ({ call: async () => 'farmer-role-hash' }),
      hasRole: (role, wallet) => ({
        call: async () => role === 'farmer-role-hash' &&
          wallet === '0x1111111111111111111111111111111111111111'
      })
    }
  };
  await assert.doesNotReject(() => assertFarmerRole(
    roleRegistry,
    '0x1111111111111111111111111111111111111111'
  ));
  await assert.rejects(
    () => assertFarmerRole(roleRegistry, '0x2222222222222222222222222222222222222222'),
    (error) => error.status === 403 && error.code === 'FARMER_ROLE_REQUIRED'
  );
});

test('custody transfer requires the recipient role on the active chain', async () => {
  const roleRegistry = {
    methods: {
      DISTRIBUTOR_ROLE: () => ({ call: async () => 'distributor-role-hash' }),
      hasRole: (role, wallet) => ({
        call: async () => role === 'distributor-role-hash' &&
          wallet === '0x3333333333333333333333333333333333333333'
      })
    }
  };
  await assert.doesNotReject(
    () => assertChainRole(
      roleRegistry,
      'distributor',
      '0x3333333333333333333333333333333333333333'
    )
  );
  await assert.rejects(
    () => assertChainRole(
      roleRegistry,
      'distributor',
      '0x4444444444444444444444444444444444444444'
    ),
    (error) => error.status === 403 && error.code === 'DISTRIBUTOR_ROLE_REQUIRED'
  );
});

test('transaction balance checks use estimated gas rather than oversized fixed limits', () => {
  assert.doesNotThrow(() => assertSufficientBalance(1_200_000n, 50_000n, 20n));
  assert.throws(
    () => assertSufficientBalance(999_999n, 50_000n, 20n),
    (error) => error.status === 409 && error.code === 'INSUFFICIENT_GAS_FUNDS'
  );
  assert.throws(
    () => assertSufficientBalance(1_200_000n, 50_000n, 20n, 200_001n),
    (error) => error.code === 'INSUFFICIENT_GAS_FUNDS'
  );
});

test('product reconciliation refuses to overwrite a different record using the same chain ID', () => {
  const pending = {
    blockchainId: 1,
    txHash: '0xnew-transaction',
    payload: { product: { batchId: 'NEW-BATCH' } }
  };
  assert.doesNotThrow(() => assertProductRegistrationTarget(null, pending));
  assert.doesNotThrow(() => assertProductRegistrationTarget({
    batchId: 'NEW-BATCH',
    transactionHash: '0xnew-transaction'
  }, pending));
  assert.throws(() => assertProductRegistrationTarget({
    batchId: 'OLD-BATCH',
    transactionHash: '0xold-transaction'
  }, pending), /refusing to overwrite it/);
});

test('displaced product archival preserves its related records before freeing the chain ID', async () => {
  const oldProduct = {
    _id: 'old-product',
    blockchainId: 1,
    batchId: 'OLD-BATCH',
    transactionHash: '0xold-transaction'
  };
  const pending = {
    blockchainId: 1,
    txHash: '0xnew-transaction',
    payload: { product: { batchId: 'NEW-BATCH' } }
  };
  const batches = [{
    _id: 'old-batch',
    batchId: 'OLD-BATCH',
    products: ['old-product'],
    totalProducts: 1
  }];
  const trackingEvents = [{ _id: 'old-event', product: 'old-product' }];
  const reviews = [{ _id: 'old-review', batch: 'old-batch' }];
  let archive;
  let productDeleted = false;
  const models = {
    Batch: {
      find: () => ({ lean: async () => batches.filter((batch) => batch.products.includes(oldProduct._id)) }),
      deleteMany: async ({ _id }) => {
        const removed = batches.filter((batch) => _id.$in.includes(batch._id));
        for (const batch of removed) batches.splice(batches.indexOf(batch), 1);
        return { deletedCount: removed.length };
      },
      updateOne: async () => ({ matchedCount: 1 })
    },
    TrackingEvent: {
      find: () => ({ lean: async () => trackingEvents.slice() }),
      deleteMany: async () => {
        const deletedCount = trackingEvents.length;
        trackingEvents.length = 0;
        return { deletedCount };
      }
    },
    ConsumerReview: {
      find: () => ({ lean: async () => reviews.slice() }),
      deleteMany: async () => {
        const deletedCount = reviews.length;
        reviews.length = 0;
        return { deletedCount };
      }
    },
    ArchivedProduct: {
      updateOne: async (filter, update) => {
        archive = { ...filter, ...update.$setOnInsert };
        return { upsertedCount: 1 };
      }
    },
    Product: {
      deleteOne: async () => {
        productDeleted = true;
        return { deletedCount: 1 };
      }
    }
  };

  const archived = await archiveDisplacedProduct({
    existingProduct: oldProduct,
    pending,
    chainId: 1337,
    contractAddress: '0x1234567890123456789012345678901234567890',
    models
  });

  assert.equal(archived, true);
  assert.equal(archive.productSnapshot, oldProduct);
  assert.deepEqual(archive.batchSnapshots, [{
    _id: 'old-batch',
    batchId: 'OLD-BATCH',
    products: ['old-product'],
    totalProducts: 1
  }]);
  assert.deepEqual(archive.trackingEventSnapshots, [{ _id: 'old-event', product: 'old-product' }]);
  assert.deepEqual(archive.consumerReviewSnapshots, [{ _id: 'old-review', batch: 'old-batch' }]);
  assert.equal(productDeleted, true);
  assert.equal(batches.length, 0);
  assert.equal(trackingEvents.length, 0);
  assert.equal(reviews.length, 0);
});

test('stale product archival records chain-reset history without a replacement transaction', async () => {
  let archive;
  const models = {
    Batch: { find: () => ({ lean: async () => [] }) },
    TrackingEvent: {
      find: () => ({ lean: async () => [] }),
      deleteMany: async () => ({ deletedCount: 0 })
    },
    ConsumerReview: {},
    ArchivedProduct: {
      updateOne: async (filter, update) => {
        archive = { ...filter, ...update.$setOnInsert };
      }
    },
    Product: { deleteOne: async () => ({ deletedCount: 1 }) }
  };
  const archived = await archiveDisplacedProduct({
    existingProduct: {
      _id: 'stale-product',
      blockchainId: 4,
      batchId: 'OLD-BATCH',
      transactionHash: '0xold-transaction'
    },
    pending: null,
    chainId: 1337,
    contractAddress: '0x1234567890123456789012345678901234567890',
    reason: 'Product ID exceeds active chain product count (1)',
    models
  });

  assert.equal(archived, true);
  assert.equal(archive.displacedByTransactionHash, null);
  assert.equal(archive.reason, 'Product ID exceeds active chain product count (1)');
});

test('stakeholder agreement acceptance requires the current version and explicit consent', () => {
  assert.equal(isAgreementAcceptanceValid(true, AGREEMENT_VERSION), true);
  assert.equal(isAgreementAcceptanceValid(false, AGREEMENT_VERSION), false);
  assert.equal(isAgreementAcceptanceValid(true, 'outdated'), false);
  assert.ok(AGREEMENT_TERMS.length >= 5);
  assert.match(AGREEMENT_HASH, /^[a-f0-9]{64}$/);
});

const fixtureProduct = () => ({
  batchId: ' BATCH-01 ',
  name: ' Tomatoes ',
  category: 'vegetables',
  deliveryWindow: '3',
  expiryDate: '2030-05-06',
  farmerWallet: '0x1111111111111111111111111111111111111111',
  harvestDate: '2030-05-01',
  quantity: '12.5',
  unit: 'kg'
});

test('canonical JSON recursively sorts object keys', () => {
  assert.equal(
    canonicalJson({ z: 1, nested: { b: true, a: false }, a: 2 }),
    '{"a":2,"nested":{"a":false,"b":true},"z":1}'
  );
});

test('canonical product hashing normalizes product values deterministically', () => {
  const normalized = canonicalProductFields(fixtureProduct());
  const reordered = Object.fromEntries(Object.entries(fixtureProduct()).reverse());
  assert.equal(hashRecord(normalized), hashRecord(canonicalProductFields(reordered)));
  assert.equal(normalized.batchId, 'BATCH-01');
  assert.equal(normalized.name, 'Tomatoes');
  assert.equal(normalized.quantity, 12.5);
  assert.equal(normalized.deliveryWindow, 3);

  const changed = canonicalProductFields({ ...fixtureProduct(), quantity: '13' });
  assert.notEqual(hashRecord(normalized), hashRecord(changed));
});

test('delivery windows entered in days convert to bounded seconds before hashing and storage', () => {
  assert.equal(deliveryWindowDaysToSeconds(3), 259200);
  assert.equal(deliveryWindowDaysToSeconds(1), 86400);
  assert.equal(deliveryWindowDaysToSeconds(365), 31536000);
  assert.throws(() => deliveryWindowDaysToSeconds(0), /1 to 365 days/);
  assert.throws(() => deliveryWindowDaysToSeconds(366), /1 to 365 days/);

  const fields = canonicalProductFields({
    ...fixtureProduct(),
    deliveryWindow: deliveryWindowDaysToSeconds(3)
  });
  assert.equal(fields.deliveryWindow, 259200);
});

test('expiry checks treat the supplied expiry date as valid through that UTC day', () => {
  assert.equal(isExpired(null), false);
  assert.equal(isExpired('not-a-date'), false);
  assert.equal(isExpired('2000-01-01'), true);
  const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);
  assert.equal(isExpired(tomorrow.toISOString()), false);
});

test('tracking event hashes are stable and bind the acting wallet', () => {
  const first = trackingHash(
    7,
    'Delivered',
    'Warehouse',
    'Received',
    '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD'
  );
  const sameWalletCase = trackingHash(
    '7',
    'Delivered',
    'Warehouse',
    'Received',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  );
  const differentWallet = trackingHash(
    7,
    'Delivered',
    'Warehouse',
    'Received',
    '0x1111111111111111111111111111111111111111'
  );
  assert.equal(first, sameWalletCase);
  assert.notEqual(first, differentWallet);
});
