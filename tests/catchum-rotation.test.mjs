import test from "node:test";
import assert from "node:assert/strict";
import {
  RotationalJoltDetector,
  chooseMotionGesture,
  mapDeviceRotationToScreen,
  normalizeMotionMode,
} from "../apps/catchum-mobile/motion-controller.js";

function settle(detector, start = 0, angle = 0) {
  let now = start;
  for (let index = 0; index < 12; index += 1) {
    detector.push({ alpha: 0, beta: 0, gamma: 0 }, now, angle);
    now += 16;
  }
  assert.equal(detector.armed, true);
  return now;
}

test("rotation-rate mapping follows screen orientation", () => {
  const rate = { alpha: 3, beta: 4, gamma: 5 };
  assert.deepEqual(mapDeviceRotationToScreen(rate, 0), { x: 3, y: 4, z: 5 });
  assert.deepEqual(mapDeviceRotationToScreen(rate, 90), { x: 4, y: -3, z: 5 });
  assert.deepEqual(mapDeviceRotationToScreen(rate, 180), { x: -3, y: -4, z: 5 });
  assert.deepEqual(mapDeviceRotationToScreen(rate, 270), { x: -4, y: 3, z: 5 });
});

test("rotational gesture follows the edge snapped downward", () => {
  const cases = [
    [{ alpha: 0, beta: -220, gamma: 0 }, "left"],
    [{ alpha: 0, beta: 220, gamma: 0 }, "right"],
    [{ alpha: -220, beta: 0, gamma: 0 }, "up"],
    [{ alpha: 220, beta: 0, gamma: 0 }, "down"],
  ];
  for (const [rate, expected] of cases) {
    const detector = new RotationalJoltDetector();
    const now = settle(detector);
    assert.equal(detector.push(rate, now, 0), expected);
  }
});

test("gentle rotation is ignored and rebound is suppressed", () => {
  const detector = new RotationalJoltDetector();
  let now = settle(detector);
  for (let index = 0; index < 20; index += 1) {
    assert.equal(detector.push({ alpha: 20, beta: -15, gamma: 0 }, now, 0), null);
    now += 16;
  }
  assert.equal(detector.push({ alpha: 0, beta: -220, gamma: 0 }, now, 0), "left");
  now += 16;
  assert.equal(detector.push({ alpha: 0, beta: 220, gamma: 0 }, now, 0), null);
});

test("both mode chooses the stronger signal when directions conflict", () => {
  assert.deepEqual(chooseMotionGesture("left", "right", 1.6, 2.1), { direction: "right", source: "rotational" });
  assert.deepEqual(chooseMotionGesture("left", "left", 1.2, 1.4), { direction: "left", source: "both" });
  assert.deepEqual(chooseMotionGesture("up", null, 1.1, 0), { direction: "up", source: "lateral" });
});

test("motion mode defaults to both", () => {
  assert.equal(normalizeMotionMode("lateral"), "lateral");
  assert.equal(normalizeMotionMode("rotational"), "rotational");
  assert.equal(normalizeMotionMode("invalid"), "both");
});
