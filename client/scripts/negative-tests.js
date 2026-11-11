const fs = require('node:fs');
const path = require('node:path');

const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const outputPath = path.resolve(__dirname, '../../docs/evidence/negative-tests-output.txt');

const cases = [
  {
    name: 'No Token - Protected Endpoint',
    method: 'GET',
    url: '/api/products',
    expectedStatus: 401,
    expectedCode: 'UNAUTHORIZED',
    expectedMessage: 'No token provided'
  },
  {
    name: 'Invalid Token - Protected Endpoint',
    method: 'GET',
    url: '/api/products',
    token: 'not-a-valid-jwt',
    expectedStatus: 401,
    expectedCode: 'UNAUTHORIZED',
    expectedMessage: 'Not authorised'
  },
  {
    name: 'Wrong Role - Register Product',
    method: 'POST',
    url: '/api/products/register',
    tokenEnv: 'CONSUMER_TOKEN',
    body: {
      name: 'Negative Test Product',
      batchId: `NEGATIVE-ROLE-${Date.now()}`,
      deliveryWindow: 30,
      quantity: 1
    },
    expectedStatus: 403,
    expectedCode: 'FORBIDDEN',
    expectedMessage: 'Only approved farmers can register products'
  },
  {
    name: 'Missing Fields - Register Product',
    method: 'POST',
    url: '/api/products/register',
    tokenEnv: 'FARMER_TOKEN',
    body: {},
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    expectedMessage: 'name is required'
  },
  {
    name: 'Duplicate Action - Confirm Buyer',
    method: 'POST',
    urlEnv: 'SOLD_PRODUCT_ID',
    urlPrefix: '/api/tracking/',
    urlSuffix: '/buyer/confirm',
    tokenEnv: 'CONSUMER_TOKEN',
    expectedStatus: 409,
    expectedCode: 'BUYER_ALREADY_CONFIRMED',
    expectedMessage: 'A buyer has already confirmed this product'
  },
  {
    name: 'Restricted Recipient - Handover',
    method: 'POST',
    urlEnv: 'HARVESTED_PRODUCT_ID',
    urlPrefix: '/api/products/',
    urlSuffix: '/handover',
    tokenEnv: 'FARMER_TOKEN',
    emailEnv: 'RESTRICTED_DISTRIBUTOR_EMAIL',
    expectedStatus: 403,
    expectedCode: 'RECIPIENT_RESTRICTED',
    expectedMessage: 'This recipient is restricted by the trust system and cannot receive handover'
  },
  {
    name: 'Feedback After Recall',
    method: 'POST',
    url: '/api/reputation/reviews',
    tokenEnv: 'CONSUMER_TOKEN',
    batchEnv: 'RECALLED_SOLD_BATCH_ID',
    rating: 8,
    expectedStatus: 409,
    expectedCode: 'PRODUCT_RECALLED',
    expectedMessage: 'Feedback cannot be submitted for a recalled product'
  },
  {
    name: 'Public Verify - Unknown Product',
    method: 'GET',
    url: '/api/verify/9007199254740991',
    expectedStatus: 404,
    expectedCode: 'PRODUCT_NOT_FOUND',
    expectedMessage: 'Product not found'
  }
];

const getMissingConfiguration = (testCase) => {
  const required = [
    testCase.tokenEnv,
    testCase.urlEnv,
    testCase.emailEnv,
    testCase.batchEnv
  ].filter(Boolean);

  return required.filter((name) => !process.env[name]);
};

const buildUrl = (testCase) => {
  if (testCase.url) return `${baseUrl}${testCase.url}`;

  const id = encodeURIComponent(process.env[testCase.urlEnv]);
  return `${baseUrl}${testCase.urlPrefix}${id}${testCase.urlSuffix}`;
};

const runCase = async (testCase) => {
  const missing = getMissingConfiguration(testCase);
  if (missing.length) {
    return {
      skipped: true,
      line: `SKIP | ${testCase.name} | expected ${testCase.expectedStatus} | actual NOT RUN | missing ${missing.join(', ')}`
    };
  }

  const headers = {};
  if (testCase.tokenEnv || testCase.token) {
    headers.Authorization = ['Bearer ', testCase.token || process.env[testCase.tokenEnv]].join('');
  }
  if (testCase.body || testCase.emailEnv || testCase.batchEnv) {
    headers['Content-Type'] = 'application/json';
  }

  let body = testCase.body;
  if (testCase.emailEnv) {
    body = { email: process.env[testCase.emailEnv] };
  } else if (testCase.batchEnv) {
    body = { batchId: process.env[testCase.batchEnv], rating: testCase.rating };
  }

  try {
    const response = await fetch(buildUrl(testCase), {
      method: testCase.method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const responseBody = await response.json().catch(() => null);
    const hasErrorShape = responseBody !== null &&
      typeof responseBody === 'object' &&
      !Array.isArray(responseBody) &&
      typeof responseBody.message === 'string' &&
      responseBody.message.length > 0 &&
      typeof responseBody.code === 'string' &&
      responseBody.code.length > 0;
    const pass = response.status === testCase.expectedStatus &&
      hasErrorShape &&
      responseBody.code === testCase.expectedCode &&
      responseBody.message === testCase.expectedMessage;
    const actual = `${response.status}${hasErrorShape ? ` (${responseBody.code})` : ' (invalid error shape)'}`;

    return {
      pass,
      skipped: false,
      line: `${pass ? 'PASS' : 'FAIL'} | ${testCase.name} | expected ${testCase.expectedStatus} (${testCase.expectedCode}) | actual ${actual}`
    };
  } catch (error) {
    return {
      pass: false,
      skipped: false,
      line: `FAIL | ${testCase.name} | expected ${testCase.expectedStatus} (${testCase.expectedCode}) | actual ERROR (${error.message})`
    };
  }
};

const main = async () => {
  const lines = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const testCase of cases) {
    const result = await runCase(testCase);
    lines.push(result.line);
    if (result.pass) passed += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;
  }

  lines.push(`Total: ${cases.length} | PASS: ${passed} | FAIL: ${failed} | SKIP: ${skipped}`);
  const output = `${lines.join('\n')}\n`;
  console.log(output.trimEnd());
  fs.writeFileSync(outputPath, output, 'utf8');

  if (failed > 0) process.exitCode = 1;
};

main();
