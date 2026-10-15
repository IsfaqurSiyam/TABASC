const config = require('./config/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { validateContractCode } = require('./blockchain/web3');
const { errorHandler, notFoundHandler } = require('./middleware/errors');
const sanitizeMongoInput = require('./middleware/sanitizeMongoInput');
const { validateJsonBody } = require('./middleware/requestValidation');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || origin === config.corsOrigin)
}));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body === undefined) return originalJson(body);
    const responseBody = res.statusCode >= 400 &&
      body && typeof body === 'object' && !Array.isArray(body)
      ? { ...body, code: body.code || 'REQUEST_ERROR' }
      : body;
    const safeBody = JSON.parse(JSON.stringify(responseBody, (_, value) => {
      if (typeof value !== 'bigint') return value;
      const numericValue = Number(value);
      return Number.isSafeInteger(numericValue) ? numericValue : value.toString();
    }));
    return originalJson(safeBody);
  };
  next();
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    message: 'Too many requests; please try again later',
    code: 'RATE_LIMITED'
  })
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    message: 'Too many authentication attempts; please try again later',
    code: 'RATE_LIMITED'
  })
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(sanitizeMongoInput);
app.use(validateJsonBody);

const { router: authRoutes } = require('./routes/auth');
const productRoutes = require('./routes/products');
const trackingRoutes = require('./routes/tracking');
const reputationRoutes = require('./routes/reputation');
const qrRoutes = require('./routes/qr');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');
const verifyRoutes = require('./routes/verify');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api', healthRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'TABASC API is running',
    version: '1.0.0',
    status: 'OK'
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await validateContractCode();
  await connectDB(config.mongoUri);

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
};

const shutdown = (server, signal) => {
  console.log(`Received ${signal}; shutting down`);
  server.close(async (error) => {
    if (error) {
      console.error('HTTP server shutdown failed');
      process.exitCode = 1;
    }
    try {
      await mongoose.disconnect();
    } catch (shutdownError) {
      console.error('Service shutdown failed');
      process.exitCode = 1;
    }
  });
};

if (require.main === module) {
  startServer().then((server) => {
    console.log(`Server running on port ${config.port}`);
    process.once('SIGINT', () => shutdown(server, 'SIGINT'));
    process.once('SIGTERM', () => shutdown(server, 'SIGTERM'));
  }).catch(async (error) => {
    console.error(`Startup failed: ${error.message}`);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
