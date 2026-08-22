import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUITS,
  autoFinish,
  canAutoFinish,
  deserializeGame,
  normalizeConfig
} from '../apps/solitaire/engine.js';

function card(suit, rank, faceUp = true) {
  return { id: `${suit}-${rank}`, suit, rank, faceUp };
}

function endgameState() {
  return {
    version: 1,
    config: normalizeConfig({ autoFinish: 'button' }),
    stock: [],
    waste: [],
    tableau: Array.from({ length: 7 }, () => []),
    foundations: Object.fromEntries(SUITS.map((suit) => [suit, []])),
    score: 0,
    moves: 0,
    recyclesUsed: 0,
    undosUsed: 0,
    won: false,
    history: []
  };
}

test('auto-finish is enabled when foundation-only play is guaranteed to finish', () => {
  const game = endgameState();
  for (const suit of SUITS) {
    game.foundations[suit] = Array.from({ length: 12 }, (_, i) => card(suit, i + 1));
  }
  game.tableau[0] = [card('clubs', 13)];
  game.tableau[1] = [card('diamonds', 13)];
  game.tableau[2] = [card('hearts', 13)];
  game.tableau[3] = [card('spades', 13)];

  assert.equal(canAutoFinish(game), true);
  assert.equal(autoFinish(game), true);
  assert.equal(game.won, true);
});

test('auto-finish stays unavailable when visible cards cannot finish by foundation-only play', () => {
  const game = endgameState();
  for (const suit of SUITS) {
    game.foundations[suit] = Array.from({ length: 10 }, (_, i) => card(suit, i + 1));
  }

  game.tableau[0] = [card('clubs', 11), card('hearts', 12), card('spades', 13)];
  game.tableau[1] = [card('diamonds', 11), card('spades', 12), card('hearts', 13)];
  game.tableau[2] = [card('hearts', 11), card('clubs', 12), card('diamonds', 13)];
  game.tableau[3] = [card('spades', 11), card('diamonds', 12), card('clubs', 13)];

  assert.equal(canAutoFinish(game), false);
  assert.equal(autoFinish(game), false);
  assert.equal(game.moves, 0);
  assert.equal(game.score, 0);
});

test('malformed saved structures are rejected instead of throwing', () => {
  const malformed = {
    version: 1,
    state: {
      config: normalizeConfig(),
      stock: [],
      waste: [],
      tableau: [],
      foundations: null,
      score: 0,
      moves: 0,
      recyclesUsed: 0,
      won: false
    },
    history: []
  };

  assert.doesNotThrow(() => deserializeGame(malformed));
  assert.equal(deserializeGame(malformed), null);
});
