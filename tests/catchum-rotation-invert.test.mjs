import test from "node:test";
import assert from "node:assert/strict";
import {
  RotationalJoltDetector,
  invertDirection,
} from "../apps/catchum-mobile/motion-controller-invert.js";

function settle(detector, start = 0) {
  let now = start;
  for (let index = 0; index < 12; index += 1) {
    detector.push({ alpha: 0, beta: 0, gamma: 0 }, now, 0);
    now += 16;
  }
  assert.equal(detector.armed, true);
  return now;
}

test("direction inversion reverses every cardinal direction", () => {
  assert.equal(invertDirection("left"), "right");
  assert.equal(invertDirection("right"), "left");
  assert.equal(invertDirection("up"), "down");
  assert.equal(invertDirection("down"), "up");
  assert.equal(invertDirection(null), null);
});

test("rotational detector preserves the original mapping when inversion is off", () => {
  const detector = new RotationalJoltDetector({ invertRotation: false });
  const now = settle(detector);
  assert.equal(detector.push({ alpha: 0, beta: -220, gamma: 0 }, now, 0), "left");
});

test("rotational detector reverses the mapping when inversion is on", () => {
  const cases = [
    [{ alpha: 0, beta: -220, gamma: 0 }, "right"],
    [{ alpha: 0, beta: 220, gamma: 0 }, "left"],
    [{ alpha: -220, beta: 0, gamma: 0 }, "down"],
    [{ alpha: 220, beta: 0, gamma: 0 }, "up"],
  ];

  for (const [rate, expected] of cases) {
    const detector = new RotationalJoltDetector({ invertRotation: true });
    const now = settle(detector);
    assert.equal(detector.push(rate, now, 0), expected);
  }
});

test("inversion can be changed without rebuilding the detector", () => {
  const detector = new RotationalJoltDetector({ invertRotation: false });
  detector.setInvertRotation(true);
  const now = settle(detector);
  assert.equal(detector.push({ alpha: 0, beta: -220, gamma: 0 }, now, 0), "right");
});
