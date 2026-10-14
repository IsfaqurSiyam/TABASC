const express      = require('express');
const cors         = require('cors');
const dotenv       = require('dotenv');
const connectDB    = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Init express
const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

const serializeBigInts = (value) => {
  if (typeof value === 'bigint') {
    const numericValue = Number(value);
    return Number.isSafeInteger(numericValue)
      ? numericValue
      : value.toString();
  }

  return value;
};

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (typeof body === 'undefined') {
      return originalJson(body);
    }

    const safeBody = JSON.parse(
      JSON.stringify(body, (_, value) => serializeBigInts(value))
    );

    return originalJson(safeBody);
  };

  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
const { router: authRoutes }   = require('./routes/auth');
const productRoutes            = require('./routes/products');
const trackingRoutes           = require('./routes/tracking');
const reputationRoutes         = require('./routes/reputation');
const qrRoutes                 = require('./routes/qr');

app.use('/api/auth',       authRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/tracking',   trackingRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/qr',          qrRoutes);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'TABASC API is running',
    version: '1.0.0',
    status:  'OK'
  });
});

// ── Test route ─────────────────────────────────────────────────────────────
app.post('/test', (req, res) => {
  res.json({ message: 'test works' });
});

// ── Start server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`MongoDB: ${process.env.MONGO_URI}`);
  console.log(`Ganache: ${process.env.GANACHE_URL}`);
});