import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig, sanitizeConfig } from "../apps/particle-system/src/simulation/config.js";
import { Simulation } from "../apps/particle-system/src/simulation/Simulation.js";

test("particle reset is deterministic for a fixed seed", () => {
  const config = { ...defaultConfig, particleCount: 80, seed: 12345 };
  const first = new Simulation(config, 640, 480);
  const second = new Simulation(config, 640, 480);

  assert.deepEqual(
    first.particles.slice(0, 12).map(({ x, y, vx, vy, hue }) => ({ x, y, vx, vy, hue })),
    second.particles.slice(0, 12).map(({ x, y, vx, vy, hue }) => ({ x, y, vx, vy, hue })),
  );
});

test("configuration sanitization clamps unsafe values", () => {
  const config = sanitizeConfig({
    particleCount: 999999,
    radius: -5,
    damping: 2,
    interactionRadius: 9999,
  }, 320);

  assert.equal(config.particleCount, 5000);
  assert.equal(config.radius, 1);
  assert.equal(config.damping, 0.995);
  assert.equal(config.interactionRadius, 320);
});
