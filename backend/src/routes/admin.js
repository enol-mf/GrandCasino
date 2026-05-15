const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

router.get('/promo', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, code, reward_chips, max_uses, uses_count, expires_at, active, created_at FROM promo_codes ORDER BY created_at DESC'
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/promo', requireAdmin,
  body('code').trim().isLength({ min: 1, max: 64 }).withMessage('Code required (max 64 chars)'),
  body('reward_chips').isInt({ min: 1 }).withMessage('reward_chips must be a positive integer'),
  body('max_uses').isInt({ min: 0 }).withMessage('max_uses must be >= 0'),
  body('expires_at').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid date format'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { code, reward_chips, max_uses, expires_at } = req.body;
    try {
      const [result] = await db.execute(
        'INSERT INTO promo_codes (code, reward_chips, max_uses, expires_at) VALUES (?, ?, ?, ?)',
        [code.trim(), reward_chips, max_uses, expires_at || null]
      );
      return res.status(201).json({ id: result.insertId, code: code.trim(), reward_chips, max_uses, uses_count: 0, expires_at: expires_at || null, active: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Code already exists' });
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

router.patch('/promo/:id/toggle', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute('UPDATE promo_codes SET active = NOT active WHERE id = ?', [id]);
    const [rows] = await db.execute('SELECT * FROM promo_codes WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/promo/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.execute('DELETE FROM promo_codes WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── Users ─────────────────────────────────────────────────────────────────

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, username, balance, is_admin, created_at FROM users ORDER BY balance DESC'
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/users/:id/balance', requireAdmin,
  body('balance').isInt({ min: 0 }).withMessage('Balance must be a non-negative integer'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { id } = req.params;
    const { balance } = req.body;
    try {
      const [result] = await db.execute('UPDATE users SET balance = ? WHERE id = ?', [balance, id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
      const [rows] = await db.execute('SELECT id, username, balance, is_admin FROM users WHERE id = ?', [id]);
      return res.json(rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
