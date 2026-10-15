const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const requiredNames = [
  'PORT',
  'MONGO_URI',
  'JWT_SECRET',
  'GANACHE_URL',
  'ROLE_REGISTRY_CONTRACT',
  'PRODUCT_CONTRACT',
  'TRACKING_CONTRACT',
  'REPUTATION_CONTRACT',
  'WALLET_PASSPHRASE',
  'CORS_ORIGIN',
  'FUND_AMOUNT_ETH',
  'JWT_EXPIRES_IN'
];

const addressNames = [
  'ROLE_REGISTRY_CONTRACT',
  'PRODUCT_CONTRACT',
  'TRACKING_CONTRACT',
  'REPUTATION_CONTRACT'
];

const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(value);

const validateEnvironment = (environment = process.env) => {
  const errors = [];

  for (const name of requiredNames) {
    if (!environment[name] || !environment[name].trim()) {
      errors.push(`${name} is required`);
    }
  }

  if (environment.PORT && !/^\d+$/.test(environment.PORT)) {
    errors.push('PORT must be a valid port number');
  } else if (environment.PORT && Number(environment.PORT) > 65535) {
    errors.push('PORT must be between 1 and 65535');
  } else if (environment.PORT && Number(environment.PORT) < 1) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (environment.MONGO_URI && !/^mongodb(?:\+srv)?:\/\//i.test(environment.MONGO_URI)) {
    errors.push('MONGO_URI must be a MongoDB connection URL');
  }

  if (environment.JWT_SECRET && environment.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  if (environment.GANACHE_URL) {
    try {
      const ganacheUrl = new URL(environment.GANACHE_URL);
      if (!['http:', 'https:'].includes(ganacheUrl.protocol) ||
          !['localhost', '127.0.0.1', '[::1]'].includes(ganacheUrl.hostname)) {
        errors.push('GANACHE_URL must point to a local Ganache HTTP endpoint');
      }
    } catch (error) {
      errors.push('GANACHE_URL must be a valid URL');
    }
  }

  for (const name of addressNames) {
    if (environment[name] && !isAddress(environment[name])) {
      errors.push(`${name} must be a valid Ethereum address`);
    }
  }

  if (environment.WALLET_PASSPHRASE && environment.WALLET_PASSPHRASE.length < 32) {
    errors.push('WALLET_PASSPHRASE must be at least 32 characters');
  }

  if (environment.ADMIN_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(environment.ADMIN_EMAIL)) {
    errors.push('ADMIN_EMAIL must be a valid email address');
  }

  if (environment.ADMIN_PASSWORD &&
      (environment.ADMIN_PASSWORD.length < 8 || !/\d/.test(environment.ADMIN_PASSWORD))) {
    errors.push('ADMIN_PASSWORD must be at least 8 characters and contain a digit');
  }

  if (environment.CORS_ORIGIN) {
    try {
      const origin = new URL(environment.CORS_ORIGIN);
      if (!['http:', 'https:'].includes(origin.protocol) ||
          origin.origin !== environment.CORS_ORIGIN) {
        errors.push('CORS_ORIGIN must be an HTTP or HTTPS origin without a path');
      }
    } catch (error) {
      errors.push('CORS_ORIGIN must be a valid origin URL');
    }
  }

  if (environment.FUND_AMOUNT_ETH &&
      (!Number.isFinite(Number(environment.FUND_AMOUNT_ETH)) ||
       Number(environment.FUND_AMOUNT_ETH) <= 0)) {
    errors.push('FUND_AMOUNT_ETH must be a positive number');
  }

  if (environment.JWT_EXPIRES_IN && !/^\d+(s|m|h|d)$/.test(environment.JWT_EXPIRES_IN)) {
    errors.push('JWT_EXPIRES_IN must be a duration such as 2h or 30m');
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return Object.freeze({
    port: Number(environment.PORT),
    mongoUri: environment.MONGO_URI,
    jwtSecret: environment.JWT_SECRET,
    ganacheUrl: environment.GANACHE_URL,
    contracts: Object.freeze({
      roleRegistry: environment.ROLE_REGISTRY_CONTRACT,
      product: environment.PRODUCT_CONTRACT,
      tracking: environment.TRACKING_CONTRACT,
      reputation: environment.REPUTATION_CONTRACT
    }),
    walletPassphrase: environment.WALLET_PASSPHRASE,
    adminEmail: environment.ADMIN_EMAIL,
    adminPassword: environment.ADMIN_PASSWORD,
    corsOrigin: environment.CORS_ORIGIN,
    fundAmountEth: environment.FUND_AMOUNT_ETH,
    jwtExpiresIn: environment.JWT_EXPIRES_IN
  });
};

module.exports = Object.freeze({
  ...validateEnvironment(),
  validateEnvironment
});
