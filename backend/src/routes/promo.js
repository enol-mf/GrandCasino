const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

router.post('/redeem', requireAuth,
  body('code').trim().notEmpty().withMessage('Code is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { code } = req.body;
    const userId = req.session.user.id;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [codes] = await conn.execute(
        'SELECT * FROM promo_codes WHERE code = ? FOR UPDATE',
        [code]
      );
      if (codes.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Promo code not found' });
      }
      const promo = codes[0];

      if (!promo.active) {
        await conn.rollback();
        return res.status(400).json({ error: 'Promo code is not active' });
      }
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        await conn.rollback();
        return res.status(400).json({ error: 'Promo code has expired' });
      }
      if (promo.max_uses > 0 && promo.uses_count >= promo.max_uses) {
        await conn.rollback();
        return res.status(400).json({ error: 'Promo code has reached its usage limit' });
      }

      const [existing] = await conn.execute(
        'SELECT id FROM promo_redemptions WHERE user_id = ? AND promo_code_id = ?',
        [userId, promo.id]
      );
      if (existing.length > 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'You have already redeemed this code' });
      }

      await conn.execute(
        'INSERT INTO promo_redemptions (user_id, promo_code_id) VALUES (?, ?)',
        [userId, promo.id]
      );
      await conn.execute(
        'UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = ?',
        [promo.id]
      );
      await conn.execute(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [promo.reward_chips, userId]
      );

      await conn.commit();

      const [userRows] = await db.execute('SELECT balance FROM users WHERE id = ?', [userId]);
      req.session.user.balance = userRows[0].balance;

      return res.json({ reward_chips: promo.reward_chips, balance: userRows[0].balance });
    } catch (err) {
      await conn.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'You have already redeemed this code' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
