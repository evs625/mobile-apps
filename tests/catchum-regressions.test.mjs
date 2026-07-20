import test from "node:test";
import assert from "node:assert/strict";
import {
  CatChumGame,
  DIRECTIONS,
  availableDirections,
  isPassableTile,
  movePosition,
  parseMaze,
} from "../apps/catchum-mobile/engine-fixed.js";
import { quaternionFromOrientationEvent } from "../apps/catchum-mobile/tilt-fixed.js";

test("invisible maze filler cannot be traversed", () => {
  const maze = parseMaze();
  assert.equal(isPassableTile("/"), false);
  assert.deepEqual(
    availableDirections(maze.tiles, { x: 2, y: 3 }).map((direction) => direction.name),
    ["up", "down"],
  );
});

test("left, right, top, and bottom tunnels wrap", () => {
  assert.deepEqual(movePosition({ x: 0, y: 11 }, DIRECTIONS.LEFT), { x: 48, y: 11 });
  assert.deepEqual(movePosition({ x: 48, y: 11 }, DIRECTIONS.RIGHT), { x: 0, y: 11 });
  assert.deepEqual(movePosition({ x: 22, y: 0 }, DIRECTIONS.UP), { x: 22, y: 22 });
  assert.deepEqual(movePosition({ x: 26, y: 22 }, DIRECTIONS.DOWN), { x: 26, y: 0 });
  assert.equal(isPassableTile("^"), true);
  assert.equal(isPassableTile("v"), true);
});

test("every dot remains reachable after enforcing one-cell corridors", () => {
  const game = new CatChumGame();
  const maze = parseMaze();
  for (const pellet of [...maze.pellets, ...maze.energizers]) {
    assert.ok(game.reachableCatTiles.has(pellet), `unreachable pellet ${pellet}`);
  }
});

test("Android orientation samples remain valid without compass alpha", () => {
  assert.ok(quaternionFromOrientationEvent({ alpha: null, beta: 12, gamma: -8 }, 90));
  assert.equal(quaternionFromOrientationEvent({ alpha: null, beta: null, gamma: -8 }, 90), null);
});
