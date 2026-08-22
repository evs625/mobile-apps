import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUITS,
  autoFinish,
  canAutoFinish,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  canRecycle,
  canUndo,
  cardColor,
  createDeck,
  deserializeGame,
  drawStock,
  isValidTableauRun,
  moveToFoundation,
  moveToTableau,
  newGame,
  normalizeConfig,
  serializeGame,
  undo,
  validateState
} from '../apps/solitaire/engine.js';

function card(suit, rank, faceUp = true) {
  return { id: `${suit}-${rank}`, suit, rank, faceUp };
}

function minimalState(config = {}) {
  return {
    version: 1,
    config: normalizeConfig(config),
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

test('deck contains every rank and suit exactly once', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
  assert.equal(deck.filter((c) => c.faceUp).length, 0);
});

test('new game deals Klondike tableau and 24-card stock', () => {
  const game = newGame({}, () => 0.42);
  assert.deepEqual(game.tableau.map((col) => col.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(game.stock.length, 24);
  for (const col of game.tableau) {
    assert.equal(col.filter((c) => c.faceUp).length, 1);
    assert.equal(col.at(-1).faceUp, true);
  }
  assert.equal(validateState(game), true);
});

test('configuration accepts only supported choices', () => {
  assert.deepEqual(normalizeConfig({ drawCount: 3, recycleLimit: 2, undoLimit: 5, controlMode: 'both', autoFinish: 'automatic' }), {
    drawCount: 3, recycleLimit: 2, undoLimit: 5, controlMode: 'both', autoFinish: 'automatic'
  });
  assert.deepEqual(normalizeConfig({ drawCount: 9, recycleLimit: 9, undoLimit: 2, controlMode: 'swipe', autoFinish: 'magic' }), {
    drawCount: 1, recycleLimit: -1, undoLimit: -1, controlMode: 'drag', autoFinish: 'button'
  });
});

test('tableau placement requires descending alternate colors; only kings fill empty columns', () => {
  assert.equal(cardColor(card('hearts', 8)), 'red');
  assert.equal(canPlaceOnTableau(card('clubs', 7), card('hearts', 8)), true);
  assert.equal(canPlaceOnTableau(card('spades', 7), card('clubs', 8)), false);
  assert.equal(canPlaceOnTableau(card('diamonds', 6), card('spades', 8)), false);
  assert.equal(canPlaceOnTableau(card('clubs', 13), undefined), true);
  assert.equal(canPlaceOnTableau(card('clubs', 12), undefined), false);
});

test('tableau runs must be face-up, descending and alternating', () => {
  assert.equal(isValidTableauRun([card('hearts', 10), card('clubs', 9), card('diamonds', 8)]), true);
  assert.equal(isValidTableauRun([card('hearts', 10), card('diamonds', 9)]), false);
  assert.equal(isValidTableauRun([card('hearts', 10), card('clubs', 8)]), false);
  assert.equal(isValidTableauRun([card('hearts', 10), card('clubs', 9, false)]), false);
});

test('foundation placement is ascending by suit from ace', () => {
  assert.equal(canPlaceOnFoundation(card('spades', 1), []), true);
  assert.equal(canPlaceOnFoundation(card('spades', 2), []), false);
  assert.equal(canPlaceOnFoundation(card('spades', 2), [card('spades', 1)]), true);
  assert.equal(canPlaceOnFoundation(card('hearts', 2), [card('spades', 1)]), false);
});

test('draw-one stock and recycle preserve stock order', () => {
  const game = minimalState({ drawCount: 1, recycleLimit: 1 });
  game.stock = [card('clubs', 1, false), card('clubs', 2, false), card('clubs', 3, false)];
  assert.equal(drawStock(game), true);
  assert.equal(game.waste.at(-1).rank, 3);
  assert.equal(drawStock(game), true);
  assert.equal(game.waste.at(-1).rank, 2);
  assert.equal(drawStock(game), true);
  assert.equal(game.waste.at(-1).rank, 1);
  assert.equal(canRecycle(game), true);
  assert.equal(drawStock(game), true);
  assert.deepEqual(game.stock.map((c) => c.rank), [1, 2, 3]);
  assert.equal(game.stock.every((c) => !c.faceUp), true);
  assert.equal(game.recyclesUsed, 1);
  assert.equal(canRecycle(game), false);
});

test('draw-three exposes the third card as waste top', () => {
  const game = minimalState({ drawCount: 3 });
  game.stock = [card('clubs', 1, false), card('clubs', 2, false), card('clubs', 3, false), card('clubs', 4, false)];
  drawStock(game);
  assert.deepEqual(game.waste.map((c) => c.rank), [4, 3, 2]);
  assert.equal(game.waste.at(-1).rank, 2);
  assert.equal(game.stock.at(-1).rank, 1);
});

test('zero recycle means only the initial stock pass', () => {
  const game = minimalState({ drawCount: 1, recycleLimit: 0 });
  game.stock = [card('clubs', 1, false)];
  drawStock(game);
  assert.equal(canRecycle(game), false);
  assert.equal(drawStock(game), false);
});

test('waste-to-tableau scores +5 and undo restores everything', () => {
  const game = minimalState({ undoLimit: 3 });
  game.waste = [card('clubs', 7)];
  game.tableau[0] = [card('hearts', 8)];
  assert.equal(moveToTableau(game, { type: 'waste' }, 0), true);
  assert.equal(game.score, 5);
  assert.equal(game.moves, 1);
  assert.equal(game.waste.length, 0);
  assert.equal(canUndo(game), true);
  assert.equal(undo(game), true);
  assert.equal(game.score, 0);
  assert.equal(game.moves, 0);
  assert.equal(game.waste.at(-1).rank, 7);
  assert.equal(game.tableau[0].length, 1);
  assert.equal(game.undosUsed, 1);
});

test('tableau move flips newly exposed card and awards +5', () => {
  const game = minimalState();
  game.tableau[0] = [card('spades', 4, false), card('hearts', 3)];
  game.tableau[1] = [card('clubs', 4)];
  assert.equal(moveToTableau(game, { type: 'tableau', column: 0, index: 1 }, 1), true);
  assert.equal(game.tableau[0].at(-1).faceUp, true);
  assert.equal(game.score, 5);
});

test('moving to foundation scores +10 plus +5 when a tableau card is exposed', () => {
  const game = minimalState();
  game.tableau[0] = [card('clubs', 2, false), card('hearts', 1)];
  assert.equal(moveToFoundation(game, { type: 'tableau', column: 0, index: 1 }), true);
  assert.equal(game.foundations.hearts.length, 1);
  assert.equal(game.tableau[0][0].faceUp, true);
  assert.equal(game.score, 15);
});

test('foundation-to-tableau scores -15', () => {
  const game = minimalState();
  game.foundations.clubs = Array.from({ length: 7 }, (_, i) => card('clubs', i + 1));
  game.tableau[0] = [card('hearts', 8)];
  assert.equal(moveToTableau(game, { type: 'foundation', suit: 'clubs' }, 0), true);
  assert.equal(game.score, -15);
  assert.equal(game.tableau[0].at(-1).rank, 7);
});

test('finite undo is a lifetime allowance and history is bounded', () => {
  const game = minimalState({ drawCount: 1, undoLimit: 1 });
  game.stock = [card('clubs', 1, false), card('clubs', 2, false)];
  drawStock(game);
  drawStock(game);
  assert.equal(game.history.length, 1);
  assert.equal(undo(game), true);
  assert.equal(game.undosUsed, 1);
  assert.equal(canUndo(game), false);
  drawStock(game);
  assert.equal(game.history.length, 0);
  assert.equal(canUndo(game), false);
});

test('undo disabled stores no snapshots', () => {
  const game = minimalState({ drawCount: 1, undoLimit: 0 });
  game.stock = [card('clubs', 1, false)];
  drawStock(game);
  assert.equal(game.history.length, 0);
  assert.equal(canUndo(game), false);
});

test('auto-finish requires an exposed foundation-only finish with empty stock and waste', () => {
  const game = minimalState();
  for (const suit of SUITS) {
    game.foundations[suit] = Array.from({ length: 12 }, (_, i) => card(suit, i + 1));
  }
  game.tableau[0] = [card('clubs', 13)];
  game.tableau[1] = [card('diamonds', 13)];
  game.tableau[2] = [card('hearts', 13)];
  game.tableau[3] = [card('spades', 13)];
  assert.equal(canAutoFinish(game), true);

  game.stock = [card('clubs', 13, false)];
  game.tableau[0] = [];
  assert.equal(canAutoFinish(game), false);

  game.stock = [];
  game.tableau[0] = [card('clubs', 13, false)];
  assert.equal(canAutoFinish(game), false);
});

test('safe auto-finish completes a deterministic endgame', () => {
  const game = minimalState();
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
  assert.equal(Object.values(game.foundations).every((pile) => pile.length === 13), true);
});

test('serialization round-trips a real game including undo history', () => {
  const game = newGame({ drawCount: 3, recycleLimit: 2, undoLimit: 5, controlMode: 'both', autoFinish: 'automatic' }, () => 0.314159);
  drawStock(game);
  drawStock(game);
  const restored = deserializeGame(serializeGame(game));
  assert.ok(restored);
  assert.equal(validateState(restored), true);
  assert.equal(restored.moves, game.moves);
  assert.equal(restored.history.length, game.history.length);
  assert.deepEqual(restored.config, game.config);
  assert.deepEqual(restored.stock.map((c) => c.id), game.stock.map((c) => c.id));
  assert.deepEqual(restored.waste.map((c) => c.id), game.waste.map((c) => c.id));
});

test('corrupt serialized game is rejected', () => {
  const game = newGame({}, () => 0.123);
  const payload = JSON.parse(serializeGame(game));
  payload.state.stock.pop();
  assert.equal(deserializeGame(payload), null);
  assert.equal(deserializeGame('not-json'), null);
});
