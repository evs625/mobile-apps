import test from "node:test";
import assert from "node:assert/strict";
import {
  JoltDetector,
  LinearAccelerationEstimator,
  mapDeviceMotionToScreen,
  normalizeScreenAngle,
} from "../apps/catchum-mobile/tilt-fixed.js";

function settle(detector, start = 0, angle = 0) {
  let now = start;
  for (let index = 0; index < 12; index += 1) {
    detector.push({ x: 0, y: 0, z: 0 }, now, angle);
    now += 16;
  }
  assert.equal(detector.armed, true);
  return now;
}

test("screen mapping follows landscape orientation", () => {
  assert.equal(normalizeScreenAngle(-90), 270);
  assert.deepEqual(mapDeviceMotionToScreen(3, 4, 0), { x: 3, y: -4 });
  assert.deepEqual(mapDeviceMotionToScreen(3, 4, 90), { x: 4, y: 3 });
  assert.deepEqual(mapDeviceMotionToScreen(3, 4, 180), { x: -3, y: 4 });
  assert.deepEqual(mapDeviceMotionToScreen(3, 4, 270), { x: -4, y: -3 });
});

test("gentle movement and hand jitter do not generate turns", () => {
  const detector = new JoltDetector();
  let now = settle(detector);
  for (let index = 0; index < 100; index += 1) {
    const x = Math.sin(index * 0.37) * 0.8;
    const y = Math.cos(index * 0.23) * 0.7;
    assert.equal(detector.push({ x, y, z: 0.2 }, now, 0), null);
    now += 16;
  }
});

test("a sharp dominant impulse produces exactly one direction", () => {
  const detector = new JoltDetector();
  let now = settle(detector);
  assert.equal(detector.push({ x: -9, y: 0.8, z: 0 }, now, 0), "left");
  now += 16;
  assert.equal(detector.push({ x: 8, y: -0.5, z: 0 }, now, 0), null, "rebound must be ignored");
  assert.equal(detector.armed, false);
});

test("detector re-arms only after cooldown and a quiet interval", () => {
  const detector = new JoltDetector();
  let now = settle(detector);
  assert.equal(detector.push({ x: 9, y: 0, z: 0 }, now, 0), "right");
  for (let index = 0; index < 25; index += 1) {
    now += 16;
    assert.equal(detector.push({ x: 0, y: 0, z: 0 }, now, 0), null);
  }
  assert.equal(detector.armed, true);
  now += 16;
  assert.equal(detector.push({ x: 0, y: -9, z: 0 }, now, 0), "down");
});

test("ambiguous diagonal jolts are rejected", () => {
  const detector = new JoltDetector();
  const now = settle(detector);
  assert.equal(detector.push({ x: 8, y: 7.5, z: 0 }, now, 0), null);
  assert.equal(detector.armed, true);
});

test("gravity fallback removes a stationary gravity vector", () => {
  const estimator = new LinearAccelerationEstimator();
  const first = estimator.extract({ acceleration: null, accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } }, 0);
  const second = estimator.extract({ acceleration: null, accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } }, 16);
  assert.deepEqual(first, { x: 0, y: 0, z: 0, source: "filtered" });
  assert.ok(Math.abs(second.x) < 1e-9);
  assert.ok(Math.abs(second.y) < 1e-9);
  assert.ok(Math.abs(second.z) < 1e-9);
});
