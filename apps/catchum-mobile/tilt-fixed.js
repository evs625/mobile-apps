import {
  TiltController as OriginalTiltController,
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

export class TiltController extends OriginalTiltController {
  constructor(options = {}) {
    super(options);
    this.calibrationSamples = 0;
    this.dataTimer = null;
    this.recalibrationTimer = null;
    this.boundScreenChange = () => {
      if (!this.enabled) return;
      window.clearTimeout(this.recalibrationTimer);
      this.recalibrationTimer = window.setTimeout(() => this.recalibrate(), 300);
    };
    window.addEventListener("orientationchange", this.boundScreenChange);
    screen.orientation?.addEventListener?.("change", this.boundScreenChange);
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
    if (!this.enabled) {
      window.addEventListener("deviceorientation", this.boundOrientation, true);
      window.addEventListener("deviceorientationabsolute", this.boundOrientation, true);
    }
    this.enabled = true;
    this.beginCalibration();
    this.armDataTimeout();
    return true;
  }

  disable() {
    window.removeEventListener("deviceorientation", this.boundOrientation, true);
    window.removeEventListener("deviceorientationabsolute", this.boundOrientation, true);
    window.clearTimeout(this.dataTimer);
    window.clearTimeout(this.recalibrationTimer);
    this.dataTimer = null;
    this.recalibrationTimer = null;
    this.enabled = false;
    this.neutral = null;
    this.latest = null;
    this.onStatus("Tilt off");
  }

  recalibrate() {
    if (!this.enabled) return this.enable();
    this.beginCalibration();
    this.armDataTimeout();
    return Promise.resolve(true);
  }

  beginCalibration() {
    this.pendingCalibration = true;
    this.calibrationSamples = 0;
    this.activeDirection = null;
    this.candidate = null;
    this.candidateCount = 0;
    this.onStatus("Hold naturally — calibrating…");
  }

  armDataTimeout() {
    window.clearTimeout(this.dataTimer);
    this.dataTimer = window.setTimeout(() => {
      if (this.pendingCalibration) this.onStatus("No motion data — tap Recalibrate or use buttons");
    }, 1_800);
  }

  handleOrientation(event) {
    const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
    this.latest = quaternionFromOrientationEvent(event, screenAngle);
    if (!this.latest) return;

    if (this.pendingCalibration || !this.neutral) {
      this.calibrationSamples += 1;
      this.neutral = this.latest;
      if (this.calibrationSamples < 5) return;
      this.pendingCalibration = false;
      window.clearTimeout(this.dataTimer);
      this.dataTimer = null;
      this.onStatus("Tilt ready");
      return;
    }

    const tilt = relativeTilt(this.neutral, this.latest);
    const engage = 10 / this.sensitivity;
    const release = 6 / this.sensitivity;
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
