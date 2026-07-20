import test from "node:test";
import assert from "node:assert/strict";
import {
  JoltDetector,
  RotationalJoltDetector,
  TiltController,
  normalizeResponseProfile,
  responseProfileOptions,
} from "../apps/catchum-mobile/motion-controller-invert.js";

function settle(detector, start = 0) {
  let now = start;
  for (let index = 0; index < 12; index += 1) {
    detector.push({ x: 0, y: 0, z: 0 }, now, 0);
    now += 16;
  }
  assert.equal(detector.armed, true);
  return now;
}

test("motion response defaults to fast", () => {
  assert.equal(normalizeResponseProfile(null), "fast");
  assert.equal(normalizeResponseProfile("balanced"), "balanced");
  assert.equal(normalizeResponseProfile("stable"), "stable");
});

test("fast response keeps thresholds but shortens smoothing and cooldown", () => {
  const fast = new JoltDetector({ responseProfile: "fast" });
  const stable = new JoltDetector({ responseProfile: "stable" });
  assert.equal(fast.triggerThreshold, stable.triggerThreshold);
  assert.equal(fast.smoothingTimeMs, 5);
  assert.equal(fast.cooldownMs, 120);
  assert.equal(stable.smoothingTimeMs, 16);
  assert.equal(stable.cooldownMs, 330);
});

test("fast detector rearms substantially earlier than stable", () => {
  const fast = new JoltDetector({ responseProfile: "fast" });
  const stable = new JoltDetector({ responseProfile: "stable" });
  let fastTime = settle(fast);
  let stableTime = settle(stable);
  assert.equal(fast.push({ x: 9, y: 0, z: 0 }, fastTime, 0), "right");
  assert.equal(stable.push({ x: 9, y: 0, z: 0 }, stableTime, 0), "right");

  for (let index = 0; index < 9; index += 1) {
    fastTime += 16;
    stableTime += 16;
    fast.push({ x: 0, y: 0, z: 0 }, fastTime, 0);
    stable.push({ x: 0, y: 0, z: 0 }, stableTime, 0);
  }
  assert.equal(fast.armed, true);
  assert.equal(stable.armed, false);
});

test("rotational detector receives the selected response profile", () => {
  const fast = new RotationalJoltDetector({ responseProfile: "fast", invertRotation: true });
  assert.equal(fast.smoothingTimeMs, responseProfileOptions("fast").rotational.smoothingTimeMs);
  assert.equal(fast.cooldownMs, 120);
  assert.equal(fast.invertRotation, true);
});

test("controller can switch response profiles without changing sensitivity or inversion", () => {
  const controller = new TiltController({ sensitivity: 1.25, invertRotation: true, responseProfile: "stable" });
  controller.setResponseProfile("fast");
  assert.equal(controller.responseProfile, "fast");
  assert.equal(controller.lateralDetector.sensitivity, 1.25);
  assert.equal(controller.lateralDetector.cooldownMs, 120);
  assert.equal(controller.rotationalDetector.invertRotation, true);
});
