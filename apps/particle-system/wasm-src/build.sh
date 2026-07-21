#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../wasm"
BUILD_ROOT="${RUNNER_TEMP:-/tmp}/particle-physics-wasm"
mkdir -p "${OUT_DIR}" "${BUILD_ROOT}"

cargo build \
  --manifest-path "${SCRIPT_DIR}/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release \
  --target-dir "${BUILD_ROOT}/scalar"
cp "${BUILD_ROOT}/scalar/wasm32-unknown-unknown/release/particle_physics.wasm" \
  "${OUT_DIR}/physics_scalar.wasm"

RUSTFLAGS="-C target-feature=+simd128" cargo build \
  --manifest-path "${SCRIPT_DIR}/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release \
  --target-dir "${BUILD_ROOT}/simd"
cp "${BUILD_ROOT}/simd/wasm32-unknown-unknown/release/particle_physics.wasm" \
  "${OUT_DIR}/physics_simd.wasm"

ls -lh "${OUT_DIR}/physics_scalar.wasm" "${OUT_DIR}/physics_simd.wasm"
