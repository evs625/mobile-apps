const MAX_TOUCHES = 8;
const TOUCH_STRIDE = 6;
const RENDER_STRIDE = 5 * 4;

export class WasmExactSimulation {
  engineName;
  config;
  width;
  height;
  instance;
  exports;
  memory;
  particleCount = 0;
  diagnostics = {
    pairChecks: 0,
    neighborCandidates: 0,
    touchPoints: 0,
    touchApplications: 0,
  };
  touchPoints = [];
  renderView = null;
  renderBuffer = null;
  renderPointer = 0;
  renderLength = 0;

  static async create(config, width, height) {
    const loaded = await loadBestModule();
    return new WasmExactSimulation(config, width, height, loaded);
  }

  constructor(config, width, height, loaded) {
    this.config = config;
    this.width = width;
    this.height = height;
    this.instance = loaded.instance;
    this.exports = loaded.instance.exports;
    this.memory = this.exports.memory;
    this.engineName = loaded.simd ? "Rust WASM exact (SIMD)" : "Rust WASM exact (scalar)";
    this.notice = loaded.simd ? "" : "WASM SIMD was unavailable; using the scalar Rust build.";
    this.createState(config.seed);
  }

  createState(seed) {
    const created = this.exports.sim_create(
      this.config.particleCount,
      this.width,
      this.height,
      seed,
      distributionCode(this.config.distribution),
    );
    if (!created) throw new Error("Rust WASM physics could not allocate simulation state.");
    this.particleCount = this.exports.sim_particle_count();
    this.configure();
    this.invalidateViews();
    this.updateDiagnostics();
  }

  setConfig(config) {
    const rebuild = config.particleCount !== this.config.particleCount
      || config.radius !== this.config.radius
      || config.distribution !== this.config.distribution
      || config.seed !== this.config.seed;
    this.config = config;
    if (rebuild) {
      this.exports.sim_destroy();
      this.createState(config.seed);
      return;
    }
    this.configure();
    if (!config.touchEnabled) this.setTouchPoints([]);
  }

  configure() {
    const c = this.config;
    this.exports.sim_configure(
      c.radius,
      c.interactionRadius,
      c.attractionStrength,
      c.repulsionStrength,
      c.forceSoftening,
      c.collisionStrength,
      c.damping,
      c.maxSpeed,
      c.wallRestitution,
      c.centerPull,
      c.wheelBias,
      c.swirlStrength,
      c.breathingAmplitude,
      c.attractionHueThreshold,
      c.repulsionHueThreshold,
      c.continuousHueMode ? 1 : 0,
      boundaryCode(c.boundaryMode),
      c.opacity,
      c.touchEnabled ? 1 : 0,
      c.touchRadius,
      c.touchFalloff,
    );
    this.invalidateViews();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.exports.sim_resize(width, height);
    this.invalidateViews();
  }

  reset(seed = this.config.seed) {
    this.exports.sim_reset(seed, distributionCode(this.config.distribution));
    this.invalidateViews();
    this.updateDiagnostics();
  }

  setTouchPoints(points) {
    this.touchPoints = this.config.touchEnabled ? points.slice(0, MAX_TOUCHES) : [];
    const pointer = this.exports.sim_touch_ptr();
    if (!pointer) {
      this.exports.sim_set_touch_count(0);
      return;
    }
    const view = new Float32Array(this.memory.buffer, pointer, MAX_TOUCHES * TOUCH_STRIDE);
    view.fill(0);
    for (let index = 0; index < this.touchPoints.length; index += 1) {
      const touch = this.touchPoints[index];
      const offset = index * TOUCH_STRIDE;
      view[offset] = touch.x;
      view[offset + 1] = touch.y;
      view[offset + 2] = touch.vx;
      view[offset + 3] = touch.vy;
      view[offset + 4] = touchModeCode(touch.mode);
      view[offset + 5] = touch.strength;
    }
    this.exports.sim_set_touch_count(this.touchPoints.length);
    this.diagnostics.touchPoints = this.touchPoints.length;
  }

  step(dt) {
    this.exports.sim_step(dt);
    this.invalidateViewsIfMemoryGrew();
    this.updateDiagnostics();
  }

  getWasmRenderState() {
    const pointer = this.exports.sim_render_ptr();
    const length = this.exports.sim_render_len();
    if (!pointer || !length) return null;
    if (
      this.renderView === null
      || this.renderBuffer !== this.memory.buffer
      || this.renderPointer !== pointer
      || this.renderLength !== length
    ) {
      this.renderBuffer = this.memory.buffer;
      this.renderPointer = pointer;
      this.renderLength = length;
      this.renderView = new Float32Array(this.memory.buffer, pointer, length);
    }
    return {
      data: this.renderView,
      count: this.particleCount,
      stride: RENDER_STRIDE,
      positionOffset: 0,
      hueOffset: 2 * 4,
      radiusOffset: 3 * 4,
      alphaOffset: 4 * 4,
    };
  }

  updateDiagnostics() {
    this.particleCount = this.exports.sim_particle_count();
    this.diagnostics.pairChecks = this.exports.sim_pair_checks();
    this.diagnostics.neighborCandidates = this.exports.sim_neighbor_candidates();
    this.diagnostics.touchPoints = this.touchPoints.length;
    this.diagnostics.touchApplications = this.exports.sim_touch_applications();
  }

  invalidateViews() {
    this.renderView = null;
    this.renderBuffer = null;
    this.renderPointer = 0;
    this.renderLength = 0;
  }

  invalidateViewsIfMemoryGrew() {
    if (this.renderBuffer && this.renderBuffer !== this.memory.buffer) this.invalidateViews();
  }

  destroy() {
    this.exports.sim_destroy();
    this.invalidateViews();
  }
}

async function loadBestModule() {
  let simdError;
  try {
    const instance = await instantiate(new URL("../../wasm/physics_simd.wasm", import.meta.url));
    if (instance.exports.sim_simd_enabled?.() !== 1) {
      throw new Error("SIMD build did not report SIMD support.");
    }
    return { instance, simd: true };
  } catch (error) {
    simdError = error;
  }
  try {
    const instance = await instantiate(new URL("../../wasm/physics_scalar.wasm", import.meta.url));
    return { instance, simd: false };
  } catch (error) {
    const simdMessage = simdError instanceof Error ? simdError.message : String(simdError);
    const scalarMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Rust WASM failed to load. SIMD: ${simdMessage}. Scalar: ${scalarMessage}`);
  }
}

async function instantiate(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  if (WebAssembly.instantiateStreaming) {
    try {
      const result = await WebAssembly.instantiateStreaming(response.clone(), {});
      return result.instance;
    } catch {
      // GitHub Pages normally serves WASM correctly, but arrayBuffer handles restrictive MIME setups.
    }
  }
  const result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
  return result.instance;
}

function distributionCode(value) {
  if (value === "ring") return 1;
  if (value === "centerBurst") return 2;
  return 0;
}

function boundaryCode(value) {
  if (value === "wrap") return 1;
  if (value === "soft") return 2;
  return 0;
}

export function touchModeCode(mode) {
  switch (mode) {
    case "attract": return 1;
    case "repel": return 2;
    case "vortexClockwise": return 3;
    case "vortexCounterclockwise": return 4;
    case "stir": return 5;
    case "brake": return 6;
    default: return 0;
  }
}
