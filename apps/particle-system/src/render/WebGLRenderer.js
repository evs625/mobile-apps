const FLOATS_PER_CPU_PARTICLE = 5;

export class WebGLRenderer {
  canvas;
  gl;
  particleProgram;
  fadeProgram;
  particleBuffer;
  quadBuffer;
  particleData = new Float32Array(5000 * FLOATS_PER_CPU_PARTICLE);
  dpr = 1;
  particleLocations;
  fadeLocations;

  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 is unavailable in this browser.");
    this.gl = gl;
    this.particleProgram = createProgram(gl, particleVertexShader, particleFragmentShader);
    this.fadeProgram = createProgram(gl, fadeVertexShader, fadeFragmentShader);
    this.particleBuffer = requireBuffer(gl);
    this.quadBuffer = requireBuffer(gl);
    this.particleLocations = {
      position: requireAttribute(gl, this.particleProgram, "a_position"),
      hue: requireAttribute(gl, this.particleProgram, "a_hue"),
      radius: requireAttribute(gl, this.particleProgram, "a_radius"),
      alpha: requireAttribute(gl, this.particleProgram, "a_alpha"),
      resolution: requireUniform(gl, this.particleProgram, "u_resolution"),
      glow: requireUniform(gl, this.particleProgram, "u_glow"),
      pointScale: requireUniform(gl, this.particleProgram, "u_pointScale"),
    };
    this.fadeLocations = {
      position: requireAttribute(gl, this.fadeProgram, "a_position"),
      alpha: requireUniform(gl, this.fadeProgram, "u_alpha"),
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  getContext() {
    return this.gl;
  }

  resize(cssWidth, cssHeight) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(cssWidth * this.dpr));
    const height = Math.max(1, Math.floor(cssHeight * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(particles, config, chamberWidth, chamberHeight) {
    const gl = this.gl;
    this.beginFrame(config);
    gl.useProgram(this.particleProgram);
    const requiredLength = particles.length * FLOATS_PER_CPU_PARTICLE;
    const data = requiredLength <= this.particleData.length
      ? this.particleData
      : new Float32Array(requiredLength);
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      const offset = i * FLOATS_PER_CPU_PARTICLE;
      data[offset] = particle.x;
      data[offset + 1] = particle.y;
      data[offset + 2] = particle.hue / 360;
      data[offset + 3] = particle.radius;
      data[offset + 4] = config.opacity;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, requiredLength), gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_CPU_PARTICLE * 4;
    bindAttribute(gl, this.particleLocations.position, 2, stride, 0);
    bindAttribute(gl, this.particleLocations.hue, 1, stride, 2 * 4);
    bindAttribute(gl, this.particleLocations.radius, 1, stride, 3 * 4);
    bindAttribute(gl, this.particleLocations.alpha, 1, stride, 4 * 4);
    this.finishParticleDraw(particles.length, config, chamberWidth, chamberHeight);
  }

  renderGpu(state, config, chamberWidth, chamberHeight) {
    const gl = this.gl;
    this.beginFrame(config);
    gl.useProgram(this.particleProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    bindAttribute(gl, this.particleLocations.position, 2, state.stride, state.positionOffset);
    bindAttribute(gl, this.particleLocations.hue, 1, state.stride, state.hueOffset);
    bindAttribute(gl, this.particleLocations.radius, 1, state.stride, state.radiusOffset);
    gl.disableVertexAttribArray(this.particleLocations.alpha);
    gl.vertexAttrib1f(this.particleLocations.alpha, config.opacity);
    this.finishParticleDraw(state.count, config, chamberWidth, chamberHeight);
  }

  beginFrame(config) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.disableVertexAttribArray(this.particleLocations.position);
    gl.disableVertexAttribArray(this.particleLocations.hue);
    gl.disableVertexAttribArray(this.particleLocations.radius);
    gl.disableVertexAttribArray(this.particleLocations.alpha);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const fade = Math.max(0, Math.min(1, config.trailFade + config.backgroundFade * 0.2));
    if (fade >= 0.96) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.useProgram(this.fadeProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    bindAttribute(gl, this.fadeLocations.position, 2, 0, 0);
    gl.uniform1f(this.fadeLocations.alpha, fade);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  finishParticleDraw(count, config, chamberWidth, chamberHeight) {
    const gl = this.gl;
    gl.uniform2f(this.particleLocations.resolution, chamberWidth, chamberHeight);
    gl.uniform1f(this.particleLocations.glow, config.glow ? 1 : 0);
    gl.uniform1f(this.particleLocations.pointScale, this.dpr * 2);
    gl.drawArrays(gl.POINTS, 0, count);
  }
}

function bindAttribute(gl, location, size, stride, offset) {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
}

function requireBuffer(gl) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Failed to create WebGL buffer.");
  return buffer;
}

function requireAttribute(gl, program, name) {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) throw new Error(`Missing shader attribute: ${name}`);
  return location;
}

function requireUniform(gl, program, name) {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`Missing shader uniform: ${name}`);
  return location;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
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
    throw new Error(gl.getShaderInfoLog(shader) || "Failed to compile WebGL shader.");
  }
  return shader;
}

const particleVertexShader = `#version 300 es
in vec2 a_position;
in float a_hue;
in float a_radius;
in float a_alpha;
uniform vec2 u_resolution;
uniform float u_pointScale;
out float v_hue;
out float v_alpha;
void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clip = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = a_radius * u_pointScale;
  v_hue = a_hue;
  v_alpha = a_alpha;
}`;

const particleFragmentShader = `#version 300 es
precision highp float;
in float v_hue;
in float v_alpha;
uniform float u_glow;
out vec4 outColor;
vec3 hsl2rgb(float h) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return rgb * rgb * (3.0 - 2.0 * rgb);
}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  vec3 color = hsl2rgb(v_hue);
  float core = smoothstep(1.0, 0.15, d);
  float glow = smoothstep(1.0, 0.0, d) * 0.28 * u_glow;
  float alpha = clamp(core * v_alpha + glow, 0.0, 1.0);
  outColor = vec4(color, alpha);
}`;

const fadeVertexShader = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

const fadeFragmentShader = `#version 300 es
precision highp float;
uniform float u_alpha;
out vec4 outColor;
void main() { outColor = vec4(0.0, 0.0, 0.0, u_alpha); }`;
