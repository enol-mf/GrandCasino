const express = require('express');
const { randomInt } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { createDeck, shuffle, handValue, cardRank, isRed } = require('../utils/deck');

const router = express.Router();

// Records game result in history only (balance updates are done explicitly per-game)
async function recordHistory(userId, game, bet, delta) {
  await db.execute(
    'INSERT INTO game_history (user_id, game, bet, result) VALUES (?, ?, ?, ?)',
    [userId, game, bet, delta]
  );
}

async function getBalance(userId) {
  const [rows] = await db.execute('SELECT balance FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) throw new Error('User not found');
  return rows[0].balance;
}

async function updateBalance(userId, delta) {
  await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [delta, userId]);
  return getBalance(userId);
}

// ─── Blackjack ─────────────────────────────────────────────────────────────

router.post('/blackjack/start', requireAuth, async (req, res) => {
  const bet = parseInt(req.body.bet);
  if (!Number.isInteger(bet) || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });

  const userId = req.session.user.id;
  const currentBalance = await getBalance(userId);
  if (bet > currentBalance) return res.status(400).json({ error: 'Insufficient balance' });

  // Deduct bet upfront
  await updateBalance(userId, -bet);

  const deck = shuffle(createDeck());
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];

  const playerVal = handValue(playerHand);
  const dealerVal = handValue(dealerHand);
  const playerBJ = playerVal === 21;
  const dealerBJ = dealerVal === 21;

  if (playerBJ || dealerBJ) {
    let payout, delta;
    if (playerBJ && dealerBJ) {
      payout = bet; delta = 0;          // push: return bet
    } else if (playerBJ) {
      payout = Math.floor(bet * 2.5); delta = payout - bet;  // 3:2
    } else {
      payout = 0; delta = -bet;         // dealer BJ: lose
    }
    if (payout > 0) await updateBalance(userId, payout);
    await recordHistory(userId, 'blackjack', bet, delta);

    const balance = await getBalance(userId);
    req.session.user.balance = balance;
    return res.json({
      status: playerBJ && dealerBJ ? 'push' : playerBJ ? 'blackjack' : 'dealer_blackjack',
      playerHand, dealerHand, playerValue: playerVal, dealerValue: dealerVal,
      balance, done: true,
    });
  }

  req.session.blackjack = { deck, playerHand, dealerHand, bet, doubled: false };

  return res.json({
    status: 'playing',
    playerHand,
    dealerHand: [dealerHand[0], { suit: 'back', value: 'back' }],
    playerValue: playerVal,
    done: false,
    canDouble: currentBalance - bet >= bet,
  });
});

router.post('/blackjack/action', requireAuth, async (req, res) => {
  const { action } = req.body;
  if (!['hit', 'stand', 'double'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!req.session.blackjack) return res.status(400).json({ error: 'No active game' });

  let { deck, playerHand, dealerHand, bet } = req.session.blackjack;
  const userId = req.session.user.id;

  if (action === 'double') {
    const bal = await getBalance(userId);
    if (bal < bet) return res.status(400).json({ error: 'Insufficient balance to double' });
    await updateBalance(userId, -bet);
    bet *= 2;
    playerHand.push(deck.pop());
    req.session.blackjack = { deck, playerHand, dealerHand, bet, doubled: true };

    const pv = handValue(playerHand);
    if (pv > 21) {
      await recordHistory(userId, 'blackjack', bet, -bet);
      delete req.session.blackjack;
      const balance = await getBalance(userId);
      req.session.user.balance = balance;
      return res.json({ status: 'bust', playerHand, dealerHand, playerValue: pv, balance, done: true });
    }
    // fall through to stand logic after doubling
  }

  if (action === 'hit') {
    playerHand.push(deck.pop());
    req.session.blackjack = { deck, playerHand, dealerHand, bet, doubled: false };
    const pv = handValue(playerHand);
    if (pv > 21) {
      await recordHistory(userId, 'blackjack', bet, -bet);
      delete req.session.blackjack;
      const balance = await getBalance(userId);
      req.session.user.balance = balance;
      return res.json({ status: 'bust', playerHand, dealerHand, playerValue: pv, balance, done: true });
    }
    return res.json({
      status: 'playing',
      playerHand,
      dealerHand: [dealerHand[0], { suit: 'back', value: 'back' }],
      playerValue: pv,
      done: false,
    });
  }

  // stand or post-double: dealer plays
  while (handValue(dealerHand) < 17) dealerHand.push(deck.pop());
  const pv = handValue(playerHand);
  const dv = handValue(dealerHand);

  let status, delta, payout;
  if (dv > 21 || pv > dv)      { status = 'win';  delta = bet;  payout = bet * 2; }
  else if (pv === dv)           { status = 'push'; delta = 0;    payout = bet; }
  else                          { status = 'lose'; delta = -bet; payout = 0; }

  if (payout > 0) await updateBalance(userId, payout);
  await recordHistory(userId, 'blackjack', bet, delta);
  delete req.session.blackjack;

  const balance = await getBalance(userId);
  req.session.user.balance = balance;
  return res.json({ status, playerHand, dealerHand, playerValue: pv, dealerValue: dv, balance, done: true });
});

// ─── Ride the Bus ──────────────────────────────────────────────────────────

// Per-round factors (compounding): cumulative 1.85× / 3.15× / 5.66× / 16.98×
const RTB_MULTIPLIERS = [1.85, 1.70, 1.80, 3.00];

router.post('/ride-the-bus/start', requireAuth, async (req, res) => {
  const bet = parseInt(req.body.bet);
  if (!Number.isInteger(bet) || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });

  const userId = req.session.user.id;
  const bal = await getBalance(userId);
  if (bet > bal) return res.status(400).json({ error: 'Insufficient balance' });

  await updateBalance(userId, -bet);

  const deck = shuffle(createDeck());
  req.session.rtb = { deck, cards: [], round: 0, bet, multiplier: 1 };

  return res.json({ round: 0, multiplier: 1 });
});

router.post('/ride-the-bus/guess', requireAuth, async (req, res) => {
  if (!req.session.rtb) return res.status(400).json({ error: 'No active game' });

  const { guess } = req.body;
  let { deck, cards, round, bet, multiplier } = req.session.rtb;
  const userId = req.session.user.id;

  const newCard = deck.pop();
  const prevCard = cards[cards.length - 1];
  cards.push(newCard);

  let correct = false;
  if (round === 0) {
    correct = (guess === 'red' && isRed(newCard)) || (guess === 'black' && !isRed(newCard));
  } else if (round === 1) {
    const pr = cardRank(prevCard), nr = cardRank(newCard);
    if (nr !== pr) correct = (guess === 'higher' && nr > pr) || (guess === 'lower' && nr < pr);
  } else if (round === 2) {
    const sorted = cards.slice(-3, -1).map(cardRank).sort((a, b) => a - b);
    const [lo, hi] = sorted;
    const nr = cardRank(newCard);
    correct = guess === 'inside' ? (nr > lo && nr < hi) : (nr < lo || nr > hi);
  } else if (round === 3) {
    correct = newCard.suit === guess;
  }

  if (!correct) {
    await recordHistory(userId, 'ride-the-bus', bet, -bet);
    delete req.session.rtb;
    const balance = await getBalance(userId);
    req.session.user.balance = balance;
    return res.json({ correct: false, card: newCard, round, balance, done: true });
  }

  multiplier = Math.round(multiplier * RTB_MULTIPLIERS[round] * 100) / 100;
  round++;

  if (round >= 4) {
    const winnings = Math.floor(bet * multiplier);
    await updateBalance(userId, winnings);
    await recordHistory(userId, 'ride-the-bus', bet, winnings - bet);
    delete req.session.rtb;
    const balance = await getBalance(userId);
    req.session.user.balance = balance;
    return res.json({ correct: true, card: newCard, round: 4, multiplier, balance, done: true, won: true });
  }

  req.session.rtb = { deck, cards, round, bet, multiplier };
  return res.json({ correct: true, card: newCard, round, multiplier, done: false });
});

router.post('/ride-the-bus/cashout', requireAuth, async (req, res) => {
  if (!req.session.rtb) return res.status(400).json({ error: 'No active game' });

  const { bet, multiplier } = req.session.rtb;
  const userId = req.session.user.id;
  const winnings = Math.floor(bet * multiplier);

  await updateBalance(userId, winnings);
  await recordHistory(userId, 'ride-the-bus', bet, winnings - bet);
  delete req.session.rtb;

  const balance = await getBalance(userId);
  req.session.user.balance = balance;
  return res.json({ winnings, balance });
});

// ─── Plinko ────────────────────────────────────────────────────────────────

const PLINKO_ROWS = 14;
const PLINKO_MULTS = [50, 10, 5, 3, 2, 1, 0.5, 0.3, 0.5, 1, 2, 3, 5, 10, 50];

router.post('/plinko/drop', requireAuth, async (req, res) => {
  const bet = parseInt(req.body.bet);
  if (!Number.isInteger(bet) || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });

  const userId = req.session.user.id;
  const bal = await getBalance(userId);
  if (bet > bal) return res.status(400).json({ error: 'Saldo insuficiente' });

  const path = Array.from({ length: PLINKO_ROWS }, () => randomInt(0, 2));
  const slot = path.reduce((a, v) => a + v, 0); // 0–14
  const multiplier = PLINKO_MULTS[slot];
  const payout = Math.floor(bet * multiplier);
  const delta = payout - bet;

  await updateBalance(userId, -bet + payout);
  await recordHistory(userId, 'plinko', bet, delta);

  const balance = await getBalance(userId);
  req.session.user.balance = balance;
  return res.json({ multiplier, payout, slot, path, balance });
});

// ─── Slots ─────────────────────────────────────────────────────────────────

const SLOT_SYMBOLS = ['cherry', 'lemon', 'orange', 'bell', 'star', 'diamond'];
const SLOT_WEIGHTS = [30, 25, 20, 15, 7, 3];
const SLOT_PAYOUTS = { cherry: 2, lemon: 3, orange: 5, bell: 10, star: 20, diamond: 50 };

function spinReel() {
  const rand = randomInt(0, 100);
  let cum = 0;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    cum += SLOT_WEIGHTS[i];
    if (rand < cum) return SLOT_SYMBOLS[i];
  }
  return SLOT_SYMBOLS[0];
}

router.post('/slots/spin', requireAuth, async (req, res) => {
  const bet = parseInt(req.body.bet);
  if (!Number.isInteger(bet) || bet <= 0) return res.status(400).json({ error: 'Apuesta inválida' });

  const userId = req.session.user.id;
  const bal = await getBalance(userId);
  if (bet > bal) return res.status(400).json({ error: 'Saldo insuficiente' });

  const reels = [spinReel(), spinReel(), spinReel()];
  let multiplier = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = SLOT_PAYOUTS[reels[0]];
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 1.5;
  }

  const payout = Math.floor(bet * multiplier);
  const delta = payout - bet;

  await updateBalance(userId, -bet + payout);
  await recordHistory(userId, 'slots', bet, delta);

  const balance = await getBalance(userId);
  req.session.user.balance = balance;
  return res.json({ reels, multiplier, payout, won: payout > 0, balance });
});

// ─── Racing ────────────────────────────────────────────────────────────────

router.post('/racing/race', requireAuth, async (req, res) => {
  const bet = parseInt(req.body.bet);
  const pick = parseInt(req.body.pick);
  const { raceType } = req.body;

  if (!Number.isInteger(bet) || bet <= 0) return res.status(400).json({ error: 'Apuesta inválida' });
  if (!Number.isInteger(pick) || pick < 0 || pick > 4) return res.status(400).json({ error: 'Selección inválida' });
  if (!['horses', 'greyhounds', 'snails'].includes(raceType)) return res.status(400).json({ error: 'Tipo inválido' });

  const userId = req.session.user.id;
  const bal = await getBalance(userId);
  if (bet > bal) return res.status(400).json({ error: 'Saldo insuficiente' });

  const winner = randomInt(0, 5);
  const won = winner === pick;
  const payout = won ? bet * 4 : 0;
  const delta = payout - bet;

  await updateBalance(userId, -bet + payout);
  await recordHistory(userId, `racing-${raceType}`, bet, delta);

  const balance = await getBalance(userId);
  req.session.user.balance = balance;
  return res.json({ winner, won, payout, delta, balance });
});

// ─── Roulette ──────────────────────────────────────────────────────────────

const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function rouletteWin(winning, betType, betValue) {
  if (betType === 'number') return winning === parseInt(betValue);
  if (winning === 0) return false;
  if (betType === 'color')  return betValue === 'red' ? ROULETTE_RED.has(winning) : !ROULETTE_RED.has(winning);
  if (betType === 'parity') return betValue === 'odd' ? winning % 2 === 1 : winning % 2 === 0;
  if (betType === 'half')   return betValue === 'low' ? winning <= 18 : winning >= 19;
  if (betType === 'dozen') {
    if (betValue === '1st') return winning >= 1 && winning <= 12;
    if (betValue === '2nd') return winning >= 13 && winning <= 24;
    return winning >= 25 && winning <= 36;
  }
  return false;
}

function rouletteMultiplier(betType) {
  if (betType === 'number') return 36;
  if (betType === 'dozen')  return 3;
  return 2;
}

router.post('/roulette/spin', requireAuth, async (req, res) => {
  const bet = parseInt(req.body.bet);
  const { betType, betValue } = req.body;

  if (!Number.isInteger(bet) || bet <= 0) return res.status(400).json({ error: 'Apuesta inválida' });

  const validValues = { color: ['red', 'black'], parity: ['odd', 'even'], half: ['low', 'high'], dozen: ['1st', '2nd', '3rd'] };
  if (!['number', 'color', 'parity', 'half', 'dozen'].includes(betType))
    return res.status(400).json({ error: 'Tipo de apuesta inválido' });

  if (betType === 'number') {
    const n = parseInt(betValue);
    if (!Number.isInteger(n) || n < 0 || n > 36) return res.status(400).json({ error: 'Número inválido' });
  } else if (!validValues[betType].includes(betValue)) {
    return res.status(400).json({ error: 'Selección inválida' });
  }

  const userId = req.session.user.id;
  const bal = await getBalance(userId);
  if (bet > bal) return res.status(400).json({ error: 'Saldo insuficiente' });

  const winning = randomInt(0, 37);
  const won = rouletteWin(winning, betType, betValue);
  const payout = won ? bet * rouletteMultiplier(betType) : 0;
  const delta = payout - bet;

  await updateBalance(userId, -bet + payout);
  await recordHistory(userId, 'roulette', bet, delta);

  const balance = await getBalance(userId);
  req.session.user.balance = balance;
  return res.json({ winning, won, payout, delta, balance });
});

// ─── Crash ─────────────────────────────────────────────────────────────────

const CRASH_MS_PER_X = 4000; // ms per 1× increment (4 s → 2×, 8 s → 3×, …)
const CRASH_EDGE = 0.05;     // 5 % house edge

function genCrashPoint() {
  const r = Math.random();
  if (r >= 1 - CRASH_EDGE) return 1.00; // instant crash (5 % of rounds)
  return Math.max(1.00, Math.floor(((1 - CRASH_EDGE) / r) * 100) / 100);
}

router.post('/crash/start', requireAuth, async (req, res) => {
  const bet = parseInt(req.body.bet);
  if (!bet || bet < 1) return res.status(400).json({ error: 'Apuesta inválida' });

  const userId = req.session.user.id;
  const bal = await getBalance(userId);
  if (bet > bal) return res.status(400).json({ error: 'Saldo insuficiente' });

  await updateBalance(userId, -bet);
  const newBal = await getBalance(userId);
  req.session.user.balance = newBal;

  req.session.crash = { bet, crashPoint: genCrashPoint(), startedAt: Date.now(), cashed: false };
  return res.json({ balance: newBal });
});

router.get('/crash/state', requireAuth, (req, res) => {
  const crash = req.session.crash;
  if (!crash) return res.status(400).json({ error: 'No hay juego activo' });

  const elapsed = Date.now() - crash.startedAt;
  const multiplier = Math.max(1.00, Math.floor((1 + elapsed / CRASH_MS_PER_X) * 100) / 100);
  const crashed = multiplier >= crash.crashPoint;

  return res.json({
    multiplier: crashed ? crash.crashPoint : multiplier,
    crashed,
    cashed: crash.cashed,
  });
});

router.post('/crash/cashout', requireAuth, async (req, res) => {
  const crash = req.session.crash;
  if (!crash) return res.status(400).json({ error: 'No hay juego activo' });
  if (crash.cashed) return res.status(400).json({ error: 'Ya cobrado' });

  crash.cashed = true; // guard against race

  const elapsed = Date.now() - crash.startedAt;
  const multiplier = Math.max(1.00, Math.floor((1 + elapsed / CRASH_MS_PER_X) * 100) / 100);
  const crashed = multiplier >= crash.crashPoint;

  const won = !crashed;
  const finalMult = crashed ? crash.crashPoint : multiplier;
  const winnings = won ? Math.floor(crash.bet * finalMult) : 0;

  if (won) await updateBalance(req.session.user.id, winnings);

  const balance = await getBalance(req.session.user.id);
  req.session.user.balance = balance;

  await recordHistory(req.session.user.id, 'crash', crash.bet, winnings - crash.bet);
  req.session.crash = null;

  return res.json({ won, multiplier: finalMult, winnings, balance });
});

module.exports = router;
