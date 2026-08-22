import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deserializeGame,
  drawStock,
  newGame,
  serializeGame,
  undo
} from '../apps/solitaire/engine.js';

function legacyCore(state) {
  return {
    config: { ...state.config },
    stock: structuredClone(state.stock),
    waste: structuredClone(state.waste),
    tableau: structuredClone(state.tableau),
    foundations: structuredClone(state.foundations),
    score: state.score,
    moves: state.moves,
    recyclesUsed: state.recyclesUsed,
    won: state.won
  };
}

test('version 2 persistence compacts unlimited undo history and restores it', () => {
  const game = newGame({ drawCount: 1, recycleLimit: -1, undoLimit: -1 }, () => 0.271828);
  for (let i = 0; i < 250; i += 1) assert.equal(drawStock(game), true);

  const serialized = serializeGame(game);
  const payload = JSON.parse(serialized);
  assert.equal(payload.version, 2);
  assert.equal(payload.history.length, 250);
  assert.ok(Array.isArray(payload.history[0]));
  assert.ok(serialized.length < 250_000, `serialized session unexpectedly large: ${serialized.length}`);

  const restored = deserializeGame(serialized);
  assert.ok(restored);
  assert.equal(restored.history.length, 250);
  assert.equal(restored.moves, game.moves);
  assert.equal(undo(restored), true);
  assert.equal(restored.moves, game.moves - 1);
});

test('legacy version 1 saves remain resumable after persistence upgrade', () => {
  const game = newGame({ drawCount: 3, recycleLimit: 2, undoLimit: 5 }, () => 0.618034);
  drawStock(game);
  drawStock(game);

  const legacy = {
    version: 1,
    state: legacyCore(game),
    undosUsed: game.undosUsed,
    history: game.history.map(legacyCore)
  };

  const restored = deserializeGame(legacy);
  assert.ok(restored);
  assert.equal(restored.moves, game.moves);
  assert.equal(restored.history.length, game.history.length);
  assert.equal(undo(restored), true);
  assert.equal(restored.moves, game.moves - 1);
});

test('malformed compact undo history rejects the saved game', () => {
  const game = newGame({}, () => 0.5);
  drawStock(game);
  const payload = JSON.parse(serializeGame(game));
  payload.history[0][0][0] = 999;
  assert.equal(deserializeGame(payload), null);
});
