import test from "node:test";
import assert from "node:assert/strict";
import {
  CatChumGame,
  DIRECTIONS,
  MAZE_HEIGHT,
  MAZE_SOURCE,
  MAZE_WIDTH,
  chooseTargetDirection,
  insertHighScore,
  parseMaze,
} from "../apps/catchum-mobile/engine.js";
import { directionFromTilt, orientationQuaternion, relativeTilt } from "../apps/catchum-mobile/tilt.js";

test("original CatChum maze is 49 by 23 and has four energizers", () => {
  const maze = parseMaze();
  assert.equal(MAZE_SOURCE.length, MAZE_HEIGHT);
  assert.ok(MAZE_SOURCE.every((row) => row.length === MAZE_WIDTH));
  assert.equal(maze.energizers.size, 4);
  assert.ok(maze.pellets.size > 150);
});

test("queued turn is used as soon as it becomes legal", () => {
  const game = new CatChumGame({ random: () => 0.5 });
  game.phase = "playing";
  game.cat.position = { x: 21, y: 1 };
  game.cat.direction = DIRECTIONS.LEFT;
  game.queueDirection("up");
  game.step();
  assert.equal(game.cat.direction.name, "up");
});

test("ghost targeting excludes a direct reverse when another route exists", () => {
  const maze = parseMaze();
  const direction = chooseTargetDirection(maze.tiles, { x: 12, y: 5 }, DIRECTIONS.RIGHT, { x: 0, y: 5 });
  assert.notEqual(direction.name, "left");
});

test("extra cats are awarded at every ten thousand points", () => {
  const game = new CatChumGame();
  game.activePlayer.score = 9_990;
  game.activePlayer.lives = 3;
  game.addScore(20);
  assert.equal(game.activePlayer.lives, 4);
  assert.equal(game.activePlayer.nextExtraScore, 20_000);
});

test("two-player death changes to the other living player", () => {
  const game = new CatChumGame({ players: 2, random: () => 0 });
  game.phase = "playing";
  game.killCat();
  game.phaseTicks = 1;
  game.step();
  assert.equal(game.activePlayer.number, 2);
});

test("high score insertion sorts and limits the table", () => {
  const table = insertHighScore([
    { name: "A", score: 10 }, { name: "B", score: 50 }, { name: "C", score: 30 },
    { name: "D", score: 20 }, { name: "E", score: 40 },
  ], { name: "NEW", score: 35 });
  assert.deepEqual(table.map((entry) => entry.score), [50, 40, 35, 30, 20]);
});

test("tilt resolver uses the dominant axis", () => {
  assert.equal(directionFromTilt(15, 4, 12), "right");
  assert.equal(directionFromTilt(-15, 4, 12), "left");
  assert.equal(directionFromTilt(2, -14, 12), "up");
  assert.equal(directionFromTilt(4, 5, 12), null);
});

test("relative orientation is neutral against itself", () => {
  const q = orientationQuaternion(37, 48, -12, 90);
  const tilt = relativeTilt(q, q);
  assert.ok(Math.abs(tilt.horizontal) < 1e-9);
  assert.ok(Math.abs(tilt.vertical) < 1e-9);
});
