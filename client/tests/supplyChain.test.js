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
  canonicalJson,
  canonicalProductFields,
  hashRecord,
  isExpired,
  trackingHash
} = require('../services/supplyChain');

test('admin seeding credentials are optional for backend startup', () => {
  const environment = { ...process.env };
  delete environment.ADMIN_EMAIL;
  delete environment.ADMIN_PASSWORD;
  assert.doesNotThrow(() => validateEnvironment(environment));
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
