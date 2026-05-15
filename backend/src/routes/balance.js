const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT balance FROM users WHERE id = ?', [req.session.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ balance: rows[0].balance });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
