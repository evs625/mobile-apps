const DEG = Math.PI / 180;

function multiply(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

function conjugate(q) {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

function normalize(q) {
  const length = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}

function axisQuaternion(axis, angle) {
  const half = angle / 2;
  const sine = Math.sin(half);
  return normalize({
    w: Math.cos(half),
    x: axis === "x" ? sine : 0,
    y: axis === "y" ? sine : 0,
    z: axis === "z" ? sine : 0,
  });
}

export function orientationQuaternion(alpha = 0, beta = 0, gamma = 0, screenAngle = 0) {
  const qAlpha = axisQuaternion("z", alpha * DEG);
  const qBeta = axisQuaternion("x", beta * DEG);
  const qGamma = axisQuaternion("y", gamma * DEG);
  const device = multiply(multiply(qAlpha, qBeta), qGamma);
  return normalize(multiply(device, axisQuaternion("z", -screenAngle * DEG)));
}

export function relativeTilt(neutral, current) {
  const q = normalize(multiply(conjugate(neutral), current));
  const sign = q.w < 0 ? -1 : 1;
  const w = Math.max(-1, Math.min(1, q.w * sign));
  const angle = 2 * Math.acos(w);
  const scale = Math.sqrt(Math.max(0, 1 - w * w));
  if (scale < 1e-6 || angle < 1e-6) return { horizontal: 0, vertical: 0, twist: 0 };
  const factor = angle / scale / DEG * sign;
  return {
    horizontal: -q.y * factor,
    vertical: q.x * factor,
    twist: q.z * factor,
  };
}

export function directionFromTilt(horizontal, vertical, engageDegrees = 12) {
  if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return null;
  if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < engageDegrees) return null;
  if (Math.abs(horizontal) > Math.abs(vertical)) return horizontal > 0 ? "right" : "left";
  return vertical > 0 ? "down" : "up";
}

export class TiltController {
  constructor({ onDirection, onStatus, sensitivity = 1 } = {}) {
    this.onDirection = onDirection || (() => {});
    this.onStatus = onStatus || (() => {});
    this.sensitivity = sensitivity;
    this.neutral = null;
    this.latest = null;
    this.enabled = false;
    this.pendingCalibration = false;
    this.candidate = null;
    this.candidateCount = 0;
    this.activeDirection = null;
    this.boundOrientation = (event) => this.handleOrientation(event);
  }

  async enable() {
    if (typeof DeviceOrientationEvent === "undefined") {
      this.onStatus("Tilt unavailable — use buttons");
      return false;
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== "granted") {
          this.onStatus("Tilt permission denied");
          return false;
        }
      } catch {
        this.onStatus("Tilt permission unavailable");
        return false;
      }
    }
    if (!this.enabled) window.addEventListener("deviceorientation", this.boundOrientation, true);
    this.enabled = true;
    this.pendingCalibration = true;
    this.onStatus("Hold naturally — calibrating…");
    return true;
  }

  disable() {
    window.removeEventListener("deviceorientation", this.boundOrientation, true);
    this.enabled = false;
    this.neutral = null;
    this.latest = null;
    this.onStatus("Tilt off");
  }

  recalibrate() {
    if (!this.enabled) return this.enable();
    this.pendingCalibration = true;
    this.activeDirection = null;
    this.candidate = null;
    this.candidateCount = 0;
    this.onStatus("Hold naturally — calibrating…");
    return Promise.resolve(true);
  }

  setSensitivity(value) {
    this.sensitivity = Math.max(0.65, Math.min(1.6, Number(value) || 1));
  }

  handleOrientation(event) {
    if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;
    const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
    this.latest = orientationQuaternion(event.alpha, event.beta, event.gamma, screenAngle);
    if (this.pendingCalibration || !this.neutral) {
      this.neutral = this.latest;
      this.pendingCalibration = false;
      this.onStatus("Tilt ready");
      return;
    }

    const tilt = relativeTilt(this.neutral, this.latest);
    const engage = 12 / this.sensitivity;
    const release = 7 / this.sensitivity;
    const next = directionFromTilt(tilt.horizontal, tilt.vertical, engage);

    if (!next && Math.max(Math.abs(tilt.horizontal), Math.abs(tilt.vertical)) < release) {
      this.activeDirection = null;
      this.candidate = null;
      this.candidateCount = 0;
      return;
    }
    if (!next || next === this.activeDirection) return;

    if (next !== this.candidate) {
      this.candidate = next;
      this.candidateCount = 1;
      return;
    }
    this.candidateCount += 1;
    if (this.candidateCount >= 2) {
      this.activeDirection = next;
      this.candidate = null;
      this.candidateCount = 0;
      this.onDirection(next);
      this.onStatus(`Tilt ${next}`);
    }
  }
}
