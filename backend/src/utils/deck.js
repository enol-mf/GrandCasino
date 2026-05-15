const { randomInt } = require('crypto');

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardNumericValue(card) {
  if (card.value === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.value)) return 10;
  return parseInt(card.value);
}

function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardNumericValue(card);
    if (card.value === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function cardRank(card) {
  return VALUES.indexOf(card.value);
}

function cardSuitIndex(card) {
  return SUITS.indexOf(card.suit);
}

function isRed(card) {
  return card.suit === 'diamonds' || card.suit === 'hearts';
}

module.exports = { createDeck, shuffle, handValue, cardRank, cardSuitIndex, isRed, VALUES, SUITS };
