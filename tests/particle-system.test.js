import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig, sanitizeConfig } from "../apps/particle-system/src/simulation/config.js";
import { estimateDepositScale, touchModeCode as gpuTouchModeCode } from "../apps/particle-system/src/simulation/GpuDensitySimulation.js";
import { Simulation } from "../apps/particle-system/src/simulation/Simulation.js";
import {
  applyTouchForcesToMemory,
  touchModeCode as wasmTouchModeCode,
} from "../apps/particle-system/src/simulation/WasmExactSimulation.js";
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

test("configuration sanitization validates all physics engines", () => {
  const config = sanitizeConfig({
    particleCount: 999999,
    radius: -5,
    damping: 2,
    interactionRadius: 9999,
    physicsEngine: "invalid",
    gpuFieldResolution: 999,
    gpuFieldForceScale: 99,
    touchModePrimary: "invalid",
    touchPrimaryStrength: 99,
    touchRadius: 9999,
    touchFalloff: 0,
  }, 320);
  assert.equal(config.particleCount, 5000);
  assert.equal(config.radius, 1);
  assert.equal(config.damping, 0.995);
  assert.equal(config.interactionRadius, 320);
  assert.equal(config.physicsEngine, "cpu");
  assert.equal(config.gpuFieldResolution, 256);
  assert.equal(config.gpuFieldForceScale, 3);
  assert.equal(config.touchModePrimary, "attract");
  assert.equal(config.touchPrimaryStrength, 1.5);
  assert.equal(config.touchRadius, 320);
  assert.equal(config.touchFalloff, 0.5);
  assert.equal(sanitizeConfig({ physicsEngine: "gpuField" }).physicsEngine, "gpuField");
  assert.equal(sanitizeConfig({ physicsEngine: "wasmExact" }).physicsEngine, "wasmExact");
  assert.equal(sanitizeConfig({ physicsEngine: "gpuField", gpuFieldResolution: 111 }).gpuFieldResolution, 96);
});

test("density deposit scale decreases as expected neighbor count rises", () => {
  const sparse = estimateDepositScale(500, 40, 1200, 800);
  const dense = estimateDepositScale(5000, 60, 1200, 800);
  assert.ok(sparse > dense);
  assert.ok(dense >= 0.004 && dense <= 0.12);
});

test("GPU and WASM touch modes use the same stable codes", () => {
  const modes = ["attract", "repel", "vortexClockwise", "vortexCounterclockwise", "stir", "brake"];
  assert.deepEqual(modes.map(gpuTouchModeCode), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(modes.map(wasmTouchModeCode), [1, 2, 3, 4, 5, 6]);
  assert.equal(gpuTouchModeCode("invalid"), 0);
  assert.equal(wasmTouchModeCode("invalid"), 0);
});

test("WASM touch bridge modifies velocity memory with independent modes", () => {
  const positions = new Float32Array([0, 0, 0, 0]);
  const velocities = new Float32Array([0, 0, 2, 0]);
  const config = {
    ...defaultConfig,
    touchEnabled: true,
    touchRadius: 100,
    touchFalloff: 1,
  };
  const applications = applyTouchForcesToMemory(
    positions,
    velocities,
    2,
    [
      { x: 50, y: 0, vx: 0, vy: 0, mode: "attract", strength: 1 },
      { x: 0, y: 50, vx: 0, vy: 0, mode: "repel", strength: 0.5 },
    ],
    config,
    1,
  );
  assert.equal(applications, 4);
  assert.ok(velocities[0] > 0);
  assert.ok(velocities[1] < 0);
  assert.ok(velocities[2] > 2);
  assert.ok(velocities[3] < 0);

  const beforeBrake = velocities[2];
  applyTouchForcesToMemory(
    positions,
    velocities,
    2,
    [{ x: 0, y: 0, vx: 0, vy: 0, mode: "brake", strength: 1 }],
    config,
    1,
  );
  assert.ok(velocities[2] < beforeBrake);
});

test("attract and repel touch modes apply opposite radial forces", () => {
  const baseParticle = {
    id: 1, x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0,
    radius: 3, hue: 0, alpha: 1, mass: 1,
  };
  const config = { ...defaultConfig, touchRadius: 100, touchFalloff: 1 };
  const touch = { x: 50, y: 0, vx: 0, vy: 0, strength: 1 };
  const attracted = { ...baseParticle };
  applyTouchForce(attracted, { ...touch, mode: "attract" }, config);
  assert.ok(attracted.fx > 0);
  const repelled = { ...baseParticle };
  applyTouchForce(repelled, { ...touch, mode: "repel" }, config);
  assert.ok(repelled.fx < 0);
});

test("multi-touch disturbances can use independent modes", () => {
  const config = {
    ...defaultConfig,
    particleCount: 1,
    centerPull: 0,
    wheelBias: 0,
    swirlStrength: 0,
    touchEnabled: true,
    touchRadius: 500,
    touchFalloff: 1,
  };
  const simulation = new Simulation(config, 300, 300);
  const particle = simulation.particles[0];
  particle.x = 150;
  particle.y = 150;
  particle.vx = 0;
  particle.vy = 0;
  simulation.setTouchPoints([
    { x: 250, y: 150, vx: 0, vy: 0, mode: "attract", strength: 0.5 },
    { x: 150, y: 250, vx: 0, vy: 0, mode: "repel", strength: 0.5 },
  ]);
  simulation.step(1);
  assert.ok(particle.vx > 0);
  assert.ok(particle.vy < 0);
  assert.equal(simulation.diagnostics.touchPoints, 2);
  assert.equal(simulation.diagnostics.touchApplications, 2);
});

test("touch points do not change behavior while touch interactions are disabled", () => {
  const config = {
    ...defaultConfig,
    particleCount: 1,
    centerPull: 0,
    wheelBias: 0,
    swirlStrength: 0,
    touchEnabled: false,
  };
  const control = new Simulation(config, 300, 300);
  const touched = new Simulation(config, 300, 300);
  touched.setTouchPoints([{ x: 150, y: 150, vx: 20, vy: 0, mode: "stir", strength: 1 }]);
  control.step(1);
  touched.step(1);
  assert.deepEqual(
    { x: touched.particles[0].x, y: touched.particles[0].y, vx: touched.particles[0].vx, vy: touched.particles[0].vy },
    { x: control.particles[0].x, y: control.particles[0].y, vx: control.particles[0].vx, vy: control.particles[0].vy },
  );
  assert.equal(touched.diagnostics.touchPoints, 0);
});
