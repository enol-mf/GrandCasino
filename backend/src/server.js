const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const db = require('./db');

const authRoutes = require('./routes/auth');
const balanceRoutes = require('./routes/balance');
const gamesRoutes = require('./routes/games');
const promoRoutes = require('./routes/promo');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet());
app.use(express.json());

app.use(cors({
  origin: isProd
    ? (process.env.FRONTEND_ORIGIN || 'http://localhost')
    : true,
  credentials: true,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

app.use('/api', authRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

async function seedAdmin() {
  try {
    const [rows] = await db.execute('SELECT id FROM users WHERE username = ?', ['admin']);
    if (rows.length === 0) {
      const hash = await bcrypt.hash('Admin1234!', 12);
      await db.execute(
        'INSERT INTO users (username, password_hash, balance, is_admin) VALUES (?, ?, ?, ?)',
        ['admin', hash, 10000, true]
      );
      console.log('Admin user created: admin / Admin1234!');
    }
  } catch (err) {
    console.error('Seed admin error:', err.message);
  }
}

async function waitForDb(retries = 15, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.execute('SELECT 1');
      return true;
    } catch (err) {
      console.log(`DB not ready (${i + 1}/${retries}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Could not connect to database');
}

waitForDb()
  .then(seedAdmin)
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Backend running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });
