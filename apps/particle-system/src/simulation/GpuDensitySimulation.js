import { Simulation } from "./Simulation.js";
import { clamp } from "./math.js";

const FLOATS_PER_PARTICLE = 6;
const STRIDE_BYTES = FLOATS_PER_PARTICLE * 4;
const MAX_TOUCHES = 8;
const TRANSFORM_VARYINGS = ["v_position", "v_velocity", "v_hue", "v_radius"];

export function estimateDepositScale(particleCount, interactionRadius, width, height) {
  const area = Math.max(1, width * height);
  const expectedNeighbors = particleCount * Math.PI * interactionRadius * interactionRadius / area;
  return clamp(3 / Math.max(1, expectedNeighbors), 0.004, 0.12);
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

export class GpuDensitySimulation {
  engineName = "GPU density field";
  config;
  width;
  height;
  gl;
  particleCount = 0;
  diagnostics = {
    pairChecks: 0,
    neighborCandidates: 0,
    touchPoints: 0,
    touchApplications: 0,
    fieldResolution: 0,
    fieldSamples: 0,
  };
  touchPoints = [];
  time = 0;
  fieldSize = 128;
  maxPointSize = 64;
  stateBuffers = [];
  stateVaos = [];
  currentState = 0;
  transformFeedback;
  fieldTexture;
  fieldFramebuffer;
  depositProgram;
  updateProgram;
  depositUniforms;
  updateUniforms;

  constructor(config, width, height, gl) {
    this.config = config;
    this.width = width;
    this.height = height;
    this.gl = gl;
    this.fieldSize = config.gpuFieldResolution;
    try {
      this.validateCapabilities();
      this.createPrograms();
      this.createStateResources();
      this.createFieldResources();
      this.reset(config.seed);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  validateCapabilities() {
    const gl = this.gl;
    const tfComponents = gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS);
    const vertexTextureUnits = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
    const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    if (tfComponents < FLOATS_PER_PARTICLE) {
      throw new Error("WebGL2 transform feedback capacity is insufficient.");
    }
    if (vertexTextureUnits < 1) {
      throw new Error("Vertex texture sampling is unavailable.");
    }
    this.maxPointSize = Math.max(1, pointRange?.[1] ?? 64);
  }

  createPrograms() {
    const gl = this.gl;
    this.depositProgram = createProgram(gl, depositVertexShader, depositFragmentShader);
    this.updateProgram = createProgram(gl, updateVertexShader, updateFragmentShader, TRANSFORM_VARYINGS);
    this.depositUniforms = uniformLocations(gl, this.depositProgram, [
      "u_resolution", "u_pointSize", "u_depositScale",
    ]);
    this.updateUniforms = uniformLocations(gl, this.updateProgram, [
      "u_field", "u_resolution", "u_fieldTexel", "u_fieldWorldTexel", "u_dt", "u_time",
      "u_attractionStrength", "u_repulsionStrength", "u_collisionStrength", "u_damping",
      "u_maxSpeed", "u_wallRestitution", "u_centerPull", "u_wheelBias", "u_swirlStrength",
      "u_breathingAmplitude", "u_radius", "u_boundaryMode", "u_fieldForceScale",
      "u_touchCount", "u_touchData[0]", "u_touchParams[0]",
    ]);
  }

  createStateResources() {
    const gl = this.gl;
    this.transformFeedback = gl.createTransformFeedback();
    if (!this.transformFeedback) throw new Error("Failed to create transform feedback.");
    for (let i = 0; i < 2; i += 1) {
      const buffer = gl.createBuffer();
      const vao = gl.createVertexArray();
      if (!buffer || !vao) throw new Error("Failed to create GPU particle buffers.");
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      bindStateAttributes(gl);
      this.stateBuffers.push(buffer);
      this.stateVaos.push(vao);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  createFieldResources() {
    const gl = this.gl;
    this.fieldTexture = gl.createTexture();
    this.fieldFramebuffer = gl.createFramebuffer();
    if (!this.fieldTexture || !this.fieldFramebuffer) {
      throw new Error("Failed to create density-field resources.");
    }
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.fieldSize, this.fieldSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fieldTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Density-field framebuffer is incomplete.");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.diagnostics.fieldResolution = this.fieldSize;
  }

  setConfig(config) {
    const needsRebuild = config.particleCount !== this.config.particleCount
      || config.radius !== this.config.radius
      || config.distribution !== this.config.distribution
      || config.seed !== this.config.seed;
    const fieldChanged = config.gpuFieldResolution !== this.fieldSize;
    this.config = config;
    if (!config.touchEnabled) this.setTouchPoints([]);
    if (fieldChanged) {
      this.fieldSize = config.gpuFieldResolution;
      this.deleteFieldResources();
      this.createFieldResources();
    }
    if (needsRebuild) this.reset(config.seed);
  }

  setTouchPoints(points) {
    this.touchPoints = this.config.touchEnabled ? points.slice(0, MAX_TOUCHES) : [];
    this.diagnostics.touchPoints = this.touchPoints.length;
    this.diagnostics.touchApplications = this.particleCount * this.touchPoints.length;
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.reset(this.config.seed);
  }

  reset(seed = this.config.seed) {
    const initializer = new Simulation({ ...this.config, physicsEngine: "cpu", seed }, this.width, this.height);
    this.particleCount = initializer.particles.length;
    const state = new Float32Array(this.particleCount * FLOATS_PER_PARTICLE);
    for (let i = 0; i < initializer.particles.length; i += 1) {
      const particle = initializer.particles[i];
      const offset = i * FLOATS_PER_PARTICLE;
      state[offset] = particle.x;
      state[offset + 1] = particle.y;
      state[offset + 2] = particle.vx;
      state[offset + 3] = particle.vy;
      state[offset + 4] = particle.hue / 360;
      state[offset + 5] = particle.radius;
    }
    const gl = this.gl;
    for (const buffer of this.stateBuffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, state, gl.DYNAMIC_COPY);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.currentState = 0;
    this.time = 0;
    this.diagnostics.fieldSamples = this.particleCount * 4;
    this.diagnostics.touchApplications = this.particleCount * this.touchPoints.length;
  }

  step(dt) {
    const scaledDt = clamp(dt, 0, 2.5);
    this.time += scaledDt * 16.6667;
    this.buildDensityField();
    this.updateParticles(scaledDt);
    this.currentState = 1 - this.currentState;
  }

  buildDensityField() {
    const gl = this.gl;
    const pointSize = Math.min(
      this.maxPointSize,
      Math.max(1, 2 * this.config.interactionRadius * this.fieldSize / Math.max(1, Math.min(this.width, this.height))),
    );
    const depositScale = estimateDepositScale(
      this.particleCount,
      this.config.interactionRadius,
      this.width,
      this.height,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFramebuffer);
    gl.viewport(0, 0, this.fieldSize, this.fieldSize);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.depositProgram);
    gl.bindVertexArray(this.stateVaos[this.currentState]);
    gl.uniform2f(this.depositUniforms.u_resolution, this.width, this.height);
    gl.uniform1f(this.depositUniforms.u_pointSize, pointSize);
    gl.uniform1f(this.depositUniforms.u_depositScale, depositScale);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  updateParticles(dt) {
    const gl = this.gl;
    const nextState = 1 - this.currentState;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.updateProgram);
    gl.bindVertexArray(this.stateVaos[this.currentState]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.uniform1i(this.updateUniforms.u_field, 0);
    gl.uniform2f(this.updateUniforms.u_resolution, this.width, this.height);
    gl.uniform2f(this.updateUniforms.u_fieldTexel, 1 / this.fieldSize, 1 / this.fieldSize);
    gl.uniform2f(this.updateUniforms.u_fieldWorldTexel, this.width / this.fieldSize, this.height / this.fieldSize);
    gl.uniform1f(this.updateUniforms.u_dt, dt);
    gl.uniform1f(this.updateUniforms.u_time, this.time);
    gl.uniform1f(this.updateUniforms.u_attractionStrength, this.config.attractionStrength);
    gl.uniform1f(this.updateUniforms.u_repulsionStrength, this.config.repulsionStrength);
    gl.uniform1f(this.updateUniforms.u_collisionStrength, this.config.collisionStrength);
    gl.uniform1f(this.updateUniforms.u_damping, this.config.damping);
    gl.uniform1f(this.updateUniforms.u_maxSpeed, this.config.maxSpeed);
    gl.uniform1f(this.updateUniforms.u_wallRestitution, this.config.wallRestitution);
    gl.uniform1f(this.updateUniforms.u_centerPull, this.config.centerPull);
    gl.uniform1f(this.updateUniforms.u_wheelBias, this.config.wheelBias);
    gl.uniform1f(this.updateUniforms.u_swirlStrength, this.config.swirlStrength);
    gl.uniform1f(this.updateUniforms.u_breathingAmplitude, this.config.breathingAmplitude);
    gl.uniform1f(this.updateUniforms.u_radius, this.config.radius);
    gl.uniform1i(this.updateUniforms.u_boundaryMode, boundaryModeCode(this.config.boundaryMode));
    gl.uniform1f(this.updateUniforms.u_fieldForceScale, this.config.gpuFieldForceScale);
    this.uploadTouches();
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.stateBuffers[nextState]);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.endTransformFeedback();
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  uploadTouches() {
    const gl = this.gl;
    const data = new Float32Array(MAX_TOUCHES * 4);
    const params = new Float32Array(MAX_TOUCHES * 4);
    for (let i = 0; i < this.touchPoints.length; i += 1) {
      const touch = this.touchPoints[i];
      const offset = i * 4;
      data[offset] = touch.x;
      data[offset + 1] = touch.y;
      data[offset + 2] = touch.vx;
      data[offset + 3] = touch.vy;
      params[offset] = touchModeCode(touch.mode);
      params[offset + 1] = touch.strength;
      params[offset + 2] = this.config.touchRadius;
      params[offset + 3] = this.config.touchFalloff;
    }
    gl.uniform1i(this.updateUniforms.u_touchCount, this.touchPoints.length);
    gl.uniform4fv(this.updateUniforms["u_touchData[0]"], data);
    gl.uniform4fv(this.updateUniforms["u_touchParams[0]"], params);
  }

  getGpuRenderState() {
    return {
      buffer: this.stateBuffers[this.currentState],
      count: this.particleCount,
      stride: STRIDE_BYTES,
      positionOffset: 0,
      hueOffset: 4 * 4,
      radiusOffset: 5 * 4,
    };
  }

  deleteFieldResources() {
    const gl = this.gl;
    if (this.fieldTexture) gl.deleteTexture(this.fieldTexture);
    if (this.fieldFramebuffer) gl.deleteFramebuffer(this.fieldFramebuffer);
    this.fieldTexture = null;
    this.fieldFramebuffer = null;
  }

  destroy() {
    const gl = this.gl;
    this.deleteFieldResources();
    for (const vao of this.stateVaos) gl.deleteVertexArray(vao);
    for (const buffer of this.stateBuffers) gl.deleteBuffer(buffer);
    if (this.transformFeedback) gl.deleteTransformFeedback(this.transformFeedback);
    if (this.depositProgram) gl.deleteProgram(this.depositProgram);
    if (this.updateProgram) gl.deleteProgram(this.updateProgram);
  }
}

function boundaryModeCode(mode) {
  if (mode === "wrap") return 1;
  if (mode === "soft") return 2;
  return 0;
}

function bindStateAttributes(gl) {
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE_BYTES, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE_BYTES, 2 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE_BYTES, 4 * 4);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE_BYTES, 5 * 4);
}

function uniformLocations(gl, program, names) {
  return Object.fromEntries(names.map((name) => {
    const location = gl.getUniformLocation(program, name);
    if (location === null) throw new Error(`Missing shader uniform: ${name}`);
    return [name, location];
  }));
}

function createProgram(gl, vertexSource, fragmentSource, transformVaryings = null) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  if (transformVaryings) {
    gl.transformFeedbackVaryings(program, transformVaryings, gl.INTERLEAVED_ATTRIBS);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Failed to link WebGL program.");
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Failed to compile WebGL shader.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

const depositVertexShader = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 2) in float a_hue;
uniform vec2 u_resolution;
uniform float u_pointSize;
out float v_hue;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_hue = a_hue;
}`;

const depositFragmentShader = `#version 300 es
precision highp float;
in float v_hue;
uniform float u_depositScale;
out vec4 outColor;
const float TAU = 6.28318530718;
void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float distanceFromCenter = length(point);
  if (distanceFromCenter > 1.0) discard;
  float radial = 1.0 - distanceFromCenter;
  float weight = radial * radial * u_depositScale;
  float angle = v_hue * TAU;
  vec2 encodedHue = vec2(cos(angle), sin(angle)) * 0.5 + 0.5;
  outColor = vec4(encodedHue * weight, weight, weight);
}`;

const updateVertexShader = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_velocity;
layout(location = 2) in float a_hue;
layout(location = 3) in float a_radius;

uniform sampler2D u_field;
uniform vec2 u_resolution;
uniform vec2 u_fieldTexel;
uniform vec2 u_fieldWorldTexel;
uniform float u_dt;
uniform float u_time;
uniform float u_attractionStrength;
uniform float u_repulsionStrength;
uniform float u_collisionStrength;
uniform float u_damping;
uniform float u_maxSpeed;
uniform float u_wallRestitution;
uniform float u_centerPull;
uniform float u_wheelBias;
uniform float u_swirlStrength;
uniform float u_breathingAmplitude;
uniform float u_radius;
uniform int u_boundaryMode;
uniform float u_fieldForceScale;
const int MAX_TOUCHES = ${MAX_TOUCHES};
uniform int u_touchCount;
uniform vec4 u_touchData[MAX_TOUCHES];
uniform vec4 u_touchParams[MAX_TOUCHES];

out vec2 v_position;
out vec2 v_velocity;
out float v_hue;
out float v_radius;

const float TAU = 6.28318530718;
const float EPSILON = 0.0001;

vec2 worldToField(vec2 position) {
  return vec2(position.x / u_resolution.x, 1.0 - position.y / u_resolution.y);
}

float potentialFromField(vec4 field, vec2 particleHue) {
  float density = field.b;
  if (density < EPSILON) return 0.0;
  vec2 averageHue = vec2(2.0 * field.r / density - 1.0, 2.0 * field.g / density - 1.0);
  float affinity = dot(particleHue, averageHue);
  float strength = affinity >= 0.0 ? u_attractionStrength : u_repulsionStrength;
  return density * affinity * strength;
}

void applyTouch(inout vec2 force, vec2 position, vec2 velocity, int index) {
  vec4 touch = u_touchData[index];
  vec4 params = u_touchParams[index];
  vec2 delta = touch.xy - position;
  float distanceSquared = dot(delta, delta);
  float radius = params.z;
  if (distanceSquared > radius * radius) return;
  float distanceToTouch = max(EPSILON, sqrt(distanceSquared));
  float proximity = max(0.0, 1.0 - distanceToTouch / radius);
  float strength = params.y * pow(proximity, params.w);
  vec2 direction = delta / distanceToTouch;
  int mode = int(params.x + 0.5);
  if (mode == 1) force += direction * strength;
  else if (mode == 2) force -= direction * strength;
  else if (mode == 3) force += vec2(direction.y, -direction.x) * strength;
  else if (mode == 4) force += vec2(-direction.y, direction.x) * strength;
  else if (mode == 5) force += touch.zw * strength * 0.08;
  else if (mode == 6) force -= velocity * strength * 0.45;
}

void main() {
  vec2 position = a_position;
  vec2 velocity = a_velocity;
  vec2 force = vec2(0.0);
  vec2 uv = worldToField(position);
  vec2 hueVector = vec2(cos(a_hue * TAU), sin(a_hue * TAU));

  vec4 leftField = texture(u_field, clamp(uv - vec2(u_fieldTexel.x, 0.0), vec2(0.0), vec2(1.0)));
  vec4 rightField = texture(u_field, clamp(uv + vec2(u_fieldTexel.x, 0.0), vec2(0.0), vec2(1.0)));
  vec4 upField = texture(u_field, clamp(uv + vec2(0.0, u_fieldTexel.y), vec2(0.0), vec2(1.0)));
  vec4 downField = texture(u_field, clamp(uv - vec2(0.0, u_fieldTexel.y), vec2(0.0), vec2(1.0)));
  float leftPotential = potentialFromField(leftField, hueVector);
  float rightPotential = potentialFromField(rightField, hueVector);
  float upPotential = potentialFromField(upField, hueVector);
  float downPotential = potentialFromField(downField, hueVector);
  vec2 potentialGradient = vec2(
    (rightPotential - leftPotential) / max(EPSILON, 2.0 * u_fieldWorldTexel.x),
    (downPotential - upPotential) / max(EPSILON, 2.0 * u_fieldWorldTexel.y)
  );
  force += potentialGradient * u_fieldForceScale * 160.0;

  float leftDensity = leftField.b;
  float rightDensity = rightField.b;
  float upDensity = upField.b;
  float downDensity = downField.b;
  vec2 densityGradient = vec2(
    (rightDensity - leftDensity) / max(EPSILON, 2.0 * u_fieldWorldTexel.x),
    (downDensity - upDensity) / max(EPSILON, 2.0 * u_fieldWorldTexel.y)
  );
  force -= densityGradient * u_collisionStrength * u_fieldForceScale * 4.0;

  vec2 center = u_resolution * 0.5;
  vec2 toCenter = center - position;
  force += toCenter * u_centerPull;

  if (u_wheelBias > 0.0) {
    float hueDegrees = a_hue * 360.0;
    float baseRadius = min(u_resolution.x, u_resolution.y) * 0.31;
    float breathing = 1.0 + sin(u_time * 0.0014 + hueDegrees * 0.03) * u_breathingAmplitude * 0.08;
    float angle = a_hue * TAU + u_time * 0.00008;
    vec2 target = center + vec2(cos(angle), sin(angle)) * baseRadius * breathing;
    force += (target - position) * u_wheelBias;
  }

  if (u_swirlStrength != 0.0) {
    vec2 fromCenter = position - center;
    float inverseRadius = 1.0 / max(120.0, length(fromCenter));
    force += vec2(-fromCenter.y, fromCenter.x) * inverseRadius * u_swirlStrength;
  }

  for (int i = 0; i < MAX_TOUCHES; i += 1) {
    if (i >= u_touchCount) break;
    applyTouch(force, position, velocity, i);
  }

  velocity = (velocity + force * u_dt) * pow(u_damping, u_dt);
  float speed = length(velocity);
  if (speed > u_maxSpeed) velocity *= u_maxSpeed / speed;
  position += velocity * u_dt;

  if (u_boundaryMode == 1) {
    if (position.x < -u_radius) position.x = u_resolution.x + u_radius;
    if (position.x > u_resolution.x + u_radius) position.x = -u_radius;
    if (position.y < -u_radius) position.y = u_resolution.y + u_radius;
    if (position.y > u_resolution.y + u_radius) position.y = -u_radius;
  } else if (u_boundaryMode == 2) {
    float margin = max(u_resolution.x, u_resolution.y) * 0.2;
    position = clamp(position, vec2(-margin), u_resolution + vec2(margin));
  } else {
    if (position.x < u_radius) { position.x = u_radius; velocity.x = abs(velocity.x) * u_wallRestitution; }
    else if (position.x > u_resolution.x - u_radius) { position.x = u_resolution.x - u_radius; velocity.x = -abs(velocity.x) * u_wallRestitution; }
    if (position.y < u_radius) { position.y = u_radius; velocity.y = abs(velocity.y) * u_wallRestitution; }
    else if (position.y > u_resolution.y - u_radius) { position.y = u_resolution.y - u_radius; velocity.y = -abs(velocity.y) * u_wallRestitution; }
  }

  v_position = position;
  v_velocity = velocity;
  v_hue = a_hue;
  v_radius = u_radius;
}`;

const updateFragmentShader = `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }`;
