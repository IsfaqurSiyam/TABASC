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

const mockModule = (filename, exports) => {
  const mocked = new Module(filename);
  mocked.filename = filename;
  mocked.loaded = true;
  mocked.exports = exports;
  require.cache[filename] = mocked;
};

mockModule(require.resolve('qrcode'), {
  toDataURL: async () => {
    throw new Error('private QR provider diagnostic');
  },
  toBuffer: async () => Buffer.from('qr')
});
mockModule(require.resolve('../routes/auth'), {
  protect: (req, res, next) => {
    req.user = { walletAddress: '0x1234567890123456789012345678901234567890' };
    next();
  }
});

const { errorHandler } = require('../middleware/errors');
const qrRoutes = require('../routes/qr');

test('QR route errors use the central non-disclosing error response', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/qr', qrRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/qr/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.message, 'An internal server error occurred');
  assert.equal(JSON.stringify(body).includes('private QR provider diagnostic'), false);
});
