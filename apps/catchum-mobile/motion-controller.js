import {
  JoltDetector,
  LinearAccelerationEstimator,
  normalizeScreenAngle,
} from "./tilt-fixed.js?lateral";

const DEFAULT_INTERVAL_MS = 16.7;
const MODES = new Set(["lateral", "rotational", "both"]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeMotionMode(value) {
  return MODES.has(value) ? value : "both";
}

// DeviceMotion rotationRate uses alpha/beta/gamma for rates around the
// device X/Y/Z axes. Rotate X/Y into the current screen's horizontal and
// vertical axes while retaining the right-handed rotation signs.
export function mapDeviceRotationToScreen(rotationRate, screenAngle = 0) {
  if (!rotationRate) return null;
  const deviceX = rotationRate.alpha;
  const deviceY = rotationRate.beta;
  if (!Number.isFinite(deviceX) || !Number.isFinite(deviceY)) return null;
  const deviceZ = finiteNumber(rotationRate.gamma);

  switch (normalizeScreenAngle(screenAngle)) {
    case 90:
      return { x: deviceY, y: -deviceX, z: deviceZ };
    case 180:
      return { x: -deviceX, y: -deviceY, z: deviceZ };
    case 270:
      return { x: -deviceY, y: deviceX, z: deviceZ };
    default:
      return { x: deviceX, y: deviceY, z: deviceZ };
  }
}

export class RotationalJoltDetector {
  constructor({
    sensitivity = 1,
    smoothingTimeMs = 18,
    restTimeMs = 100,
    cooldownMs = 330,
    dominanceRatio = 1.35,
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
    return 105 / Math.sqrt(this.sensitivity);
  }

  get jerkThreshold() {
    return 700 / Math.sqrt(this.sensitivity);
  }

  get restThreshold() {
    return Math.min(30, this.triggerThreshold * 0.25);
  }

  reset() {
    this.filtered = { x: 0, y: 0, z: 0 };
    this.lastTimestamp = null;
    this.lastTriggerTimestamp = Number.NEGATIVE_INFINITY;
    this.restStartedAt = null;
    this.sampleCount = 0;
    this.armed = false;
    this.lastTriggerStrength = 0;
  }

  suppress(timestamp) {
    this.armed = false;
    this.lastTriggerTimestamp = timestamp;
    this.restStartedAt = null;
  }

  push(rotationRate, timestamp, screenAngle = 0) {
    if (!Number.isFinite(timestamp)) return null;
    const screen = mapDeviceRotationToScreen(rotationRate, screenAngle);
    if (!screen) return null;

    const dt = clamp(
      Number.isFinite(this.lastTimestamp) ? timestamp - this.lastTimestamp : DEFAULT_INTERVAL_MS,
      8,
      60,
    );
    this.lastTimestamp = timestamp;

    const previousDominant = Math.max(Math.abs(this.filtered.x), Math.abs(this.filtered.y));
    const blend = 1 - Math.exp(-dt / this.smoothingTimeMs);
    this.filtered.x += blend * (screen.x - this.filtered.x);
    this.filtered.y += blend * (screen.y - this.filtered.y);
    this.filtered.z += blend * (screen.z - this.filtered.z);
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

    const riseRate = Math.max(0, dominant - previousDominant) / (dt / 1000);
    const decisivelyStrong = dominant >= this.triggerThreshold * 1.35;
    if (riseRate < this.jerkThreshold && !decisivelyStrong) return null;

    // The requested direction is the edge snapped downward:
    // left edge down -> left; top edge down -> up; etc.
    const direction = absX > absY
      ? (this.filtered.x > 0 ? "down" : "up")
      : (this.filtered.y > 0 ? "right" : "left");

    this.lastTriggerStrength = dominant / this.triggerThreshold;
    this.suppress(timestamp);
    return direction;
  }
}

function lateralStrength(detector) {
  const dominant = Math.max(Math.abs(detector.filtered?.x || 0), Math.abs(detector.filtered?.y || 0));
  return dominant / detector.triggerThreshold;
}

function suppressLateral(detector, timestamp) {
  detector.armed = false;
  detector.lastTriggerTimestamp = timestamp;
  detector.restStartedAt = null;
}

export function chooseMotionGesture(lateral, rotational, lateralScore = 0, rotationalScore = 0) {
  if (!lateral) return rotational ? { direction: rotational, source: "rotational" } : null;
  if (!rotational) return { direction: lateral, source: "lateral" };
  if (lateral === rotational) return { direction: lateral, source: "both" };
  return rotationalScore > lateralScore
    ? { direction: rotational, source: "rotational" }
    : { direction: lateral, source: "lateral" };
}

export class TiltController {
  constructor({ onDirection, onStatus, sensitivity = 1, mode = "both" } = {}) {
    this.onDirection = onDirection || (() => {});
    this.onStatus = onStatus || (() => {});
    this.estimator = new LinearAccelerationEstimator();
    this.lateralDetector = new JoltDetector({ sensitivity });
    this.rotationalDetector = new RotationalJoltDetector({ sensitivity });
    this.mode = normalizeMotionMode(mode);
    this.enabled = false;
    this.hasAnyData = false;
    this.hasLateralData = false;
    this.hasRotationData = false;
    this.readyAnnounced = false;
    this.dataTimer = null;
    this.boundMotion = (event) => this.handleMotion(event);
    this.boundModeChange = (event) => this.setMode(event?.detail);
    globalThis.window?.addEventListener?.("catchum-motion-mode", this.boundModeChange);
  }

  currentMode() {
    const selected = globalThis.document?.querySelector?.("[data-motion-mode]")?.value;
    return normalizeMotionMode(selected || this.mode);
  }

  async enable() {
    const MotionEvent = globalThis.DeviceMotionEvent;
    if (typeof MotionEvent === "undefined") {
      this.onStatus("Motion control unavailable — use buttons");
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
    this.resetDetectors("Hold steady — arming motion control…");
    this.armDataTimeout();
    return true;
  }

  disable() {
    globalThis.window?.removeEventListener?.("devicemotion", this.boundMotion, true);
    clearTimeout(this.dataTimer);
    this.dataTimer = null;
    this.enabled = false;
    this.hasAnyData = false;
    this.hasLateralData = false;
    this.hasRotationData = false;
    this.readyAnnounced = false;
    this.estimator.reset();
    this.lateralDetector.reset();
    this.rotationalDetector.reset();
    this.onStatus("Motion control off");
  }

  recalibrate() {
    if (!this.enabled) return this.enable();
    this.resetDetectors("Hold steady — resetting motion baseline…");
    this.armDataTimeout();
    return Promise.resolve(true);
  }

  setSensitivity(value) {
    this.lateralDetector.setSensitivity(value);
    this.rotationalDetector.setSensitivity(value);
  }

  setMode(value) {
    this.mode = normalizeMotionMode(value);
    if (!this.enabled) return;
    this.resetDetectors("Hold steady — arming selected motion mode…");
    this.armDataTimeout();
  }

  resetDetectors(message) {
    this.estimator.reset();
    this.lateralDetector.reset();
    this.rotationalDetector.reset();
    this.hasAnyData = false;
    this.hasLateralData = false;
    this.hasRotationData = false;
    this.readyAnnounced = false;
    this.onStatus(message);
  }

  armDataTimeout() {
    clearTimeout(this.dataTimer);
    this.dataTimer = setTimeout(() => {
      const mode = this.currentMode();
      if (!this.hasAnyData) this.onStatus("No motion data — use Chrome/PWA or buttons");
      else if (mode === "rotational" && !this.hasRotationData) this.onStatus("No gyro data — use lateral mode or buttons");
      else if (mode === "lateral" && !this.hasLateralData) this.onStatus("No acceleration data — use rotational mode or buttons");
    }, 1_800);
  }

  handleMotion(event) {
    const timestamp = Number.isFinite(event?.timeStamp)
      ? event.timeStamp
      : globalThis.performance?.now?.() ?? Date.now();
    const acceleration = this.estimator.extract(event, timestamp);
    const rotationAvailable = Boolean(mapDeviceRotationToScreen(event?.rotationRate, 0));
    if (!acceleration && !rotationAvailable) return;

    this.hasAnyData = true;
    if (acceleration) this.hasLateralData = true;
    if (rotationAvailable) this.hasRotationData = true;
    clearTimeout(this.dataTimer);
    this.dataTimer = null;

    const screenAngle = globalThis.screen?.orientation?.angle ?? globalThis.window?.orientation ?? 0;
    const mode = this.currentMode();
    const lateral = mode !== "rotational" && acceleration
      ? this.lateralDetector.push(acceleration, timestamp, screenAngle)
      : null;
    const rotational = mode !== "lateral"
      ? this.rotationalDetector.push(event?.rotationRate, timestamp, screenAngle)
      : null;

    const gesture = chooseMotionGesture(
      lateral,
      rotational,
      lateralStrength(this.lateralDetector),
      this.rotationalDetector.lastTriggerStrength,
    );

    const selectedDetectors = mode === "lateral"
      ? [this.lateralDetector]
      : mode === "rotational"
        ? [this.rotationalDetector]
        : [this.lateralDetector, this.rotationalDetector];
    if (!this.readyAnnounced && selectedDetectors.some((detector) => detector.armed)) {
      this.readyAnnounced = true;
      this.onStatus(mode === "both" ? "Motion ready — shift or rotate" : `${mode === "lateral" ? "Lateral" : "Rotation"} ready`);
    }

    if (!gesture) return;
    suppressLateral(this.lateralDetector, timestamp);
    this.rotationalDetector.suppress(timestamp);
    this.readyAnnounced = false;
    this.onDirection(gesture.direction);
    const label = gesture.source === "rotational" ? "ROTATE" : gesture.source === "both" ? "JOLT/ROTATE" : "JOLT";
    this.onStatus(`${label} ${gesture.direction.toUpperCase()}`);
  }
}
