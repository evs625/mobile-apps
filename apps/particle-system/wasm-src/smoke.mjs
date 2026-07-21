import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.resolve(here, "../wasm");

const scalar = await load(path.join(wasmDir, "physics_scalar.wasm"));
const simd = await load(path.join(wasmDir, "physics_simd.wasm"));
assert.equal(scalar.sim_simd_enabled(), 0);
assert.equal(simd.sim_simd_enabled(), 1);

const scalarState = run(scalar, 5000);
const simdState = run(simd, 5000);
assert.equal(scalarState.length, 5000 * 5);
assert.equal(simdState.length, 5000 * 5);
for (const value of simdState.subarray(0, 200)) assert.ok(Number.isFinite(value));

const comparisonCount = 200;
const scalarSmall = run(scalar, comparisonCount, 4);
const simdSmall = run(simd, comparisonCount, 4);
let maxDifference = 0;
for (let index = 0; index < scalarSmall.length; index += 1) {
  maxDifference = Math.max(maxDifference, Math.abs(scalarSmall[index] - simdSmall[index]));
}
assert.ok(maxDifference < 0.002, `scalar/SIMD divergence too large: ${maxDifference}`);
console.log(`Rust WASM smoke passed; scalar/SIMD max difference ${maxDifference}`);

async function load(filename) {
  const bytes = fs.readFileSync(filename);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports;
}

function run(exports, count, steps = 2) {
  assert.equal(exports.sim_create(count, 1080, 1920, 6252026, 0), 1);
  exports.sim_configure(
    3.2, 58, 0.006, 0.009, 24, 1.1, 0.93, 5.5, 0.46,
    0.0008, 0.0015, 0.0014, 0.12, 62, 118, 1, 0, 0.92, 0, 140, 2,
  );
  for (let step = 0; step < steps; step += 1) exports.sim_step(1);
  assert.ok(exports.sim_pair_checks() > 0);
  const pointer = exports.sim_render_ptr();
  const length = exports.sim_render_len();
  const result = new Float32Array(length);
  result.set(new Float32Array(exports.memory.buffer, pointer, length));
  exports.sim_destroy();
  return result;
}
