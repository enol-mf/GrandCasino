const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../db');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

router.post('/register',
  body('username').matches(USERNAME_RE).withMessage('Username must be 3-32 alphanumeric/underscore chars'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { username, password } = req.body;
    try {
      const hash = await bcrypt.hash(password, 12);
      const [result] = await db.execute(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        [username, hash]
      );
      const userId = result.insertId;
      req.session.user = { id: userId, username, balance: 1000, is_admin: false };
      return res.json({ id: userId, username, balance: 1000, is_admin: false });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Username already taken' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post('/login',
  body('username').notEmpty(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { username, password } = req.body;
    try {
      const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      req.session.user = {
        id: user.id,
        username: user.username,
        balance: user.balance,
        is_admin: !!user.is_admin,
      };
      return res.json({ id: user.id, username: user.username, balance: user.balance, is_admin: !!user.is_admin });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/leaderboard', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const [rows] = await db.execute(
      'SELECT username, balance FROM users WHERE is_admin = FALSE ORDER BY balance DESC LIMIT 10'
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const [rows] = await db.execute('SELECT id, username, balance, is_admin FROM users WHERE id = ?', [req.session.user.id]);
    if (rows.length === 0) return res.status(401).json({ error: 'User not found' });
    const u = rows[0];
    req.session.user = { id: u.id, username: u.username, balance: u.balance, is_admin: !!u.is_admin };
    return res.json({ id: u.id, username: u.username, balance: u.balance, is_admin: !!u.is_admin });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
