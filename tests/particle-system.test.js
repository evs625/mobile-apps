import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig, sanitizeConfig } from "../apps/particle-system/src/simulation/config.js";
import { estimateDepositScale, touchModeCode } from "../apps/particle-system/src/simulation/GpuDensitySimulation.js";
import { Simulation } from "../apps/particle-system/src/simulation/Simulation.js";
import { applyTouchForce } from "../apps/particle-system/src/simulation/touch.js";

test("particle reset is deterministic for a fixed seed", () => {
  const config = { ...defaultConfig, particleCount: 80, seed: 12345 };
  const first = new Simulation(config, 640, 480);
  const second = new Simulation(config, 640, 480);
  assert.deepEqual(
    first.particles.slice(0, 12).map(({ x, y, vx, vy, hue }) => ({ x, y, vx, vy, hue })),
    second.particles.slice(0, 12).map(({ x, y, vx, vy, hue }) => ({ x, y, vx, vy, hue })),
  );
});

test("configuration sanitization validates GPU engine settings", () => {
  const config = sanitizeConfig({
    physicsEngine: "invalid",
    gpuFieldResolution: 999,
    gpuFieldForceScale: 99,
  });
  assert.equal(config.physicsEngine, "cpu");
  assert.equal(config.gpuFieldResolution, 256);
  assert.equal(config.gpuFieldForceScale, 3);
  assert.equal(sanitizeConfig({ physicsEngine: "gpuField", gpuFieldResolution: 111 }).gpuFieldResolution, 96);
});

test("density deposit scale decreases as expected neighbor count rises", () => {
  const sparse = estimateDepositScale(500, 40, 1200, 800);
  const dense = estimateDepositScale(5000, 60, 1200, 800);
  assert.ok(sparse > dense);
  assert.ok(dense >= 0.004 && dense <= 0.12);
});

test("GPU touch modes have stable shader codes", () => {
  assert.deepEqual(
    ["attract", "repel", "vortexClockwise", "vortexCounterclockwise", "stir", "brake"].map(touchModeCode),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(touchModeCode("invalid"), 0);
});

test("attract and repel touch modes apply opposite radial forces", () => {
  const baseParticle = { id: 1, x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0, radius: 3, hue: 0, alpha: 1, mass: 1 };
  const config = { ...defaultConfig, touchRadius: 100, touchFalloff: 1 };
  const touch = { x: 50, y: 0, vx: 0, vy: 0, strength: 1 };
  const attracted = { ...baseParticle };
  applyTouchForce(attracted, { ...touch, mode: "attract" }, config);
  assert.ok(attracted.fx > 0);
  const repelled = { ...baseParticle };
  applyTouchForce(repelled, { ...touch, mode: "repel" }, config);
  assert.ok(repelled.fx < 0);
});
