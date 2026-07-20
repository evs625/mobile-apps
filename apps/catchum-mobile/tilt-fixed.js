import {
  directionFromTilt,
  orientationQuaternion,
  relativeTilt,
} from "./tilt.js?original";

export { directionFromTilt, orientationQuaternion, relativeTilt };

export function quaternionFromOrientationEvent(event, screenAngle = 0) {
  if (![event?.beta, event?.gamma].every(Number.isFinite)) return null;
  const alpha = Number.isFinite(event.alpha) ? event.alpha : 0;
  return orientationQuaternion(alpha, event.beta, event.gamma, screenAngle);
}

const DEFAULT_INTERVAL_MS = 16.7;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function hasPlanarValues(vector) {
  return Boolean(vector && Number.isFinite(vector.x) && Number.isFinite(vector.y));
}

export function normalizeScreenAngle(angle = 0) {
  const rounded = Math.round(finiteNumber(angle) / 90) * 90;
  return ((rounded % 360) + 360) % 360;
}

// Device-motion axes stay attached to the phone's natural orientation.
// Convert them to the current on-screen right/down coordinate system.
export function mapDeviceMotionToScreen(x, y, screenAngle = 0) {
  switch (normalizeScreenAngle(screenAngle)) {
    case 90:
      return { x: y, y: x };
    case 180:
      return { x: -x, y };
    case 270:
      return { x: -y, y: -x };
    default:
      return { x, y: -y };
  }
}

export class LinearAccelerationEstimator {
  constructor({ gravityTimeConstantMs = 320 } = {}) {
    this.gravityTimeConstantMs = gravityTimeConstantMs;
    this.reset();
  }

  reset() {
    this.gravity = null;
    this.lastTimestamp = null;
  }

  extract(event, timestamp) {
    const direct = event?.acceleration;
    if (hasPlanarValues(direct)) {
      this.lastTimestamp = timestamp;
      return {
        x: direct.x,
        y: direct.y,
        z: finiteNumber(direct.z),
        source: "linear",
      };
    }

    const total = event?.accelerationIncludingGravity;
    if (!hasPlanarValues(total)) return null;

    const sample = {
      x: total.x,
      y: total.y,
      z: finiteNumber(total.z),
    };

    if (!this.gravity) {
      this.gravity = { ...sample };
      this.lastTimestamp = timestamp;
      return { x: 0, y: 0, z: 0, source: "filtered" };
    }

    const dt = clamp(
      Number.isFinite(this.lastTimestamp) ? timestamp - this.lastTimestamp : DEFAULT_INTERVAL_MS,
      8,
      60,
    );
    this.lastTimestamp = timestamp;
    const retain = Math.exp(-dt / this.gravityTimeConstantMs);

    this.gravity.x = retain * this.gravity.x + (1 - retain) * sample.x;
    this.gravity.y = retain * this.gravity.y + (1 - retain) * sample.y;
    this.gravity.z = retain * this.gravity.z + (1 - retain) * sample.z;

    return {
      x: sample.x - this.gravity.x,
      y: sample.y - this.gravity.y,
      z: sample.z - this.gravity.z,
      source: "filtered",
    };
  }
}

export class JoltDetector {
  constructor({
    sensitivity = 1,
    smoothingTimeMs = 16,
    restTimeMs = 100,
    cooldownMs = 330,
    dominanceRatio = 1.4,
  } = {}) {
    this.smoothingTimeMs = smoothingTimeMs;
    this.restTimeMs = restTimeMs;
    this.cooldownMs = cooldownMs;
    this.dominanceRatio = dominanceRatio;
    this.setSensitivity(sensitivity);
    this.reset();
  }

  setSensitivity(value) {
    this.sensitivity = clamp(Number(value) || 1, 0.65, 1.6);
  }

  get triggerThreshold() {
    return 4.7 / Math.sqrt(this.sensitivity);
  }

  get jerkThreshold() {
    return 30 / Math.sqrt(this.sensitivity);
  }

  get restThreshold() {
    return Math.min(1.35, this.triggerThreshold * 0.28);
  }

  reset() {
    this.filtered = { x: 0, y: 0, z: 0 };
    this.lastTimestamp = null;
    this.lastTriggerTimestamp = Number.NEGATIVE_INFINITY;
    this.restStartedAt = null;
    this.sampleCount = 0;
    this.armed = false;
  }

  push(deviceAcceleration, timestamp, screenAngle = 0) {
    if (!hasPlanarValues(deviceAcceleration) || !Number.isFinite(timestamp)) return null;

    const screen = mapDeviceMotionToScreen(deviceAcceleration.x, deviceAcceleration.y, screenAngle);
    const input = {
      x: screen.x,
      y: screen.y,
      z: finiteNumber(deviceAcceleration.z),
    };
    const dt = clamp(
      Number.isFinite(this.lastTimestamp) ? timestamp - this.lastTimestamp : DEFAULT_INTERVAL_MS,
      8,
      60,
    );
    this.lastTimestamp = timestamp;

    const previousDominant = Math.max(Math.abs(this.filtered.x), Math.abs(this.filtered.y));
    const blend = 1 - Math.exp(-dt / this.smoothingTimeMs);
    this.filtered.x += blend * (input.x - this.filtered.x);
    this.filtered.y += blend * (input.y - this.filtered.y);
    this.filtered.z += blend * (input.z - this.filtered.z);
    this.sampleCount += 1;

    const absX = Math.abs(this.filtered.x);
    const absY = Math.abs(this.filtered.y);
    const dominant = Math.max(absX, absY);
    const secondary = Math.min(absX, absY);
    const planarMagnitude = Math.hypot(this.filtered.x, this.filtered.y);

    if (planarMagnitude < this.restThreshold) {
      if (this.restStartedAt === null) this.restStartedAt = timestamp;
      const cooledDown = timestamp - this.lastTriggerTimestamp >= this.cooldownMs;
      const rested = timestamp - this.restStartedAt >= this.restTimeMs;
      if (this.sampleCount >= 6 && cooledDown && rested) this.armed = true;
    } else {
      this.restStartedAt = null;
    }

    if (!this.armed || dominant < this.triggerThreshold) return null;
    if (secondary > 0 && dominant / secondary < this.dominanceRatio) return null;

    const positiveRiseRate = Math.max(0, dominant - previousDominant) / (dt / 1000);
    const decisivelyStrong = dominant >= this.triggerThreshold * 1.35;
    if (positiveRiseRate < this.jerkThreshold && !decisivelyStrong) return null;

    let direction;
    if (absX > absY) direction = this.filtered.x > 0 ? "right" : "left";
    else direction = this.filtered.y > 0 ? "down" : "up";

    this.armed = false;
    this.lastTriggerTimestamp = timestamp;
    this.restStartedAt = null;
    return direction;
  }
}

export class TiltController {
  constructor({ onDirection, onStatus, sensitivity = 1 } = {}) {
    this.onDirection = onDirection || (() => {});
    this.onStatus = onStatus || (() => {});
    this.estimator = new LinearAccelerationEstimator();
    this.detector = new JoltDetector({ sensitivity });
    this.enabled = false;
    this.hasMotionData = false;
    this.readyAnnounced = false;
    this.dataTimer = null;
    this.boundMotion = (event) => this.handleMotion(event);
  }

  async enable() {
    const MotionEvent = globalThis.DeviceMotionEvent;
    if (typeof MotionEvent === "undefined") {
      this.onStatus("Jolt control unavailable — use buttons");
      return false;
    }

    if (typeof MotionEvent.requestPermission === "function") {
      try {
        const result = await MotionEvent.requestPermission();
        if (result !== "granted") {
          this.onStatus("Motion permission denied");
          return false;
        }
      } catch {
        this.onStatus("Motion permission unavailable");
        return false;
      }
    }

    if (!this.enabled) window.addEventListener("devicemotion", this.boundMotion, true);
    this.enabled = true;
    this.resetDetector("Hold steady — arming jolt control…");
    this.armDataTimeout();
    return true;
  }

  disable() {
    if (typeof window !== "undefined") window.removeEventListener("devicemotion", this.boundMotion, true);
    clearTimeout(this.dataTimer);
    this.dataTimer = null;
    this.enabled = false;
    this.hasMotionData = false;
    this.readyAnnounced = false;
    this.estimator.reset();
    this.detector.reset();
    this.onStatus("Jolt control off");
  }

  recalibrate() {
    if (!this.enabled) return this.enable();
    this.resetDetector("Hold steady — resetting motion baseline…");
    this.armDataTimeout();
    return Promise.resolve(true);
  }

  setSensitivity(value) {
    this.detector.setSensitivity(value);
  }

  resetDetector(message) {
    this.estimator.reset();
    this.detector.reset();
    this.hasMotionData = false;
    this.readyAnnounced = false;
    this.onStatus(message);
  }

  armDataTimeout() {
    clearTimeout(this.dataTimer);
    this.dataTimer = setTimeout(() => {
      if (!this.hasMotionData) this.onStatus("No motion data — use Chrome/PWA or buttons");
    }, 1_800);
  }

  handleMotion(event) {
    const timestamp = Number.isFinite(event?.timeStamp)
      ? event.timeStamp
      : globalThis.performance?.now?.() ?? Date.now();
    const acceleration = this.estimator.extract(event, timestamp);
    if (!acceleration) return;

    if (!this.hasMotionData) {
      this.hasMotionData = true;
      clearTimeout(this.dataTimer);
      this.dataTimer = null;
    }

    const screenAngle = globalThis.screen?.orientation?.angle ?? globalThis.window?.orientation ?? 0;
    const direction = this.detector.push(acceleration, timestamp, screenAngle);

    if (!this.readyAnnounced && this.detector.armed) {
      this.readyAnnounced = true;
      this.onStatus("Jolt ready — snap phone in a direction");
    }

    if (!direction) return;
    this.readyAnnounced = false;
    this.onDirection(direction);
    this.onStatus(`JOLT ${direction.toUpperCase()}`);
  }
}
