import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTouchControllerMode,
  resolveSwipeDirection,
  swipeThreshold,
} from "../apps/catchum-mobile/swipe-controller.js";

test("touch controller mode defaults to the D-pad", () => {
  assert.equal(normalizeTouchControllerMode("dpad"), "dpad");
  assert.equal(normalizeTouchControllerMode("swipe"), "swipe");
  assert.equal(normalizeTouchControllerMode("unknown"), "dpad");
});

test("small thumb jitter is ignored", () => {
  assert.equal(resolveSwipeDirection(8, 5, 18), null);
  assert.equal(resolveSwipeDirection(-10, -8, 18), null);
});

test("the dominant slide axis determines one of four directions", () => {
  assert.equal(resolveSwipeDirection(30, 8, 18), "right");
  assert.equal(resolveSwipeDirection(-30, 8, 18), "left");
  assert.equal(resolveSwipeDirection(7, -31, 18), "up");
  assert.equal(resolveSwipeDirection(7, 31, 18), "down");
});

test("diagonal slides use the nearest cardinal direction", () => {
  assert.equal(resolveSwipeDirection(30, 22, 18), "right");
  assert.equal(resolveSwipeDirection(-20, -28, 18), "up");
});

test("swipe threshold scales with pad size but keeps a usable minimum", () => {
  assert.equal(swipeThreshold(80, 100), 14);
  assert.equal(swipeThreshold(200, 150), 18);
});
