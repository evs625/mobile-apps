import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp01,
  interpolatePosition,
  projectedPosition,
  remainingProgress,
  wrappedRenderPositions,
} from "../apps/catchum-mobile/visual-motion.js";

test("actor projection advances continuously between logical cells", () => {
  assert.deepEqual(projectedPosition({ x: 10, y: 4 }, "right", 0.5), { x: 10.5, y: 4 });
  assert.deepEqual(projectedPosition({ x: 10, y: 4 }, "up", 0.25), { x: 10, y: 3.75 });
});

test("late queued turns consume only the remaining part of the interval", () => {
  assert.ok(Math.abs(remainingProgress(0.7, 0.4) - 0.5) < 1e-12);
  assert.deepEqual(
    interpolatePosition({ x: 2.4, y: 5 }, { x: 2, y: 4 }, 0.5),
    { x: 2.2, y: 4.5 },
  );
});

test("portal movement renders a matching copy on the opposite edge", () => {
  assert.deepEqual(
    wrappedRenderPositions({ x: -0.5, y: 11 }, 49, 23),
    [{ x: -0.5, y: 11 }, { x: 48.5, y: 11 }],
  );
  assert.deepEqual(
    wrappedRenderPositions({ x: 22, y: -0.25 }, 49, 23),
    [{ x: 22, y: -0.25 }, { x: 22, y: 22.75 }],
  );
});

test("visual progress cannot overshoot a cell", () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(1.5), 1);
});
