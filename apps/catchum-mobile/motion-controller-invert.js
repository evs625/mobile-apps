import {
  JoltDetector as BaseJoltDetector,
  RotationalJoltDetector as BaseRotationalJoltDetector,
  TiltController as BaseTiltController,
} from "./motion-controller.js?base";

export * from "./motion-controller.js?base";

const INVERT_STORAGE_KEY = "catchum-mobile-invert-rotation-v1";
const RESPONSE_STORAGE_KEY = "catchum-mobile-motion-response-v1";
const RESPONSE_PROFILES = Object.freeze({
  fast: Object.freeze({
    lateral: Object.freeze({ smoothingTimeMs: 5, restTimeMs: 28, cooldownMs: 120, dominanceRatio: 1.30 }),
    rotational: Object.freeze({ smoothingTimeMs: 6, restTimeMs: 28, cooldownMs: 120, dominanceRatio: 1.25 }),
  }),
  balanced: Object.freeze({
    lateral: Object.freeze({ smoothingTimeMs: 10, restTimeMs: 48, cooldownMs: 180, dominanceRatio: 1.35 }),
    rotational: Object.freeze({ smoothingTimeMs: 11, restTimeMs: 48, cooldownMs: 180, dominanceRatio: 1.30 }),
  }),
  stable: Object.freeze({
    lateral: Object.freeze({ smoothingTimeMs: 16, restTimeMs: 100, cooldownMs: 330, dominanceRatio: 1.40 }),
    rotational: Object.freeze({ smoothingTimeMs: 18, restTimeMs: 100, cooldownMs: 330, dominanceRatio: 1.35 }),
  }),
});

const OPPOSITE = Object.freeze({
  left: "right",
  right: "left",
  up: "down",
  down: "up",
});

export function invertDirection(direction) {
  return OPPOSITE[direction] || direction || null;
}

export function normalizeResponseProfile(value) {
  return Object.hasOwn(RESPONSE_PROFILES, value) ? value : "fast";
}

export function responseProfileOptions(value) {
  return RESPONSE_PROFILES[normalizeResponseProfile(value)];
}

function readStoredInvert() {
  try {
    return localStorage.getItem(INVERT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readStoredResponseProfile() {
  try {
    return normalizeResponseProfile(localStorage.getItem(RESPONSE_STORAGE_KEY));
  } catch {
    return "fast";
  }
}

export class JoltDetector extends BaseJoltDetector {
  constructor(options = {}) {
    const responseProfile = normalizeResponseProfile(options.responseProfile);
    super({
      ...responseProfileOptions(responseProfile).lateral,
      ...options,
    });
    this.responseProfile = responseProfile;
  }
}

export class RotationalJoltDetector extends BaseRotationalJoltDetector {
  constructor(options = {}) {
    const responseProfile = normalizeResponseProfile(options.responseProfile);
    super({
      ...responseProfileOptions(responseProfile).rotational,
      ...options,
    });
    this.responseProfile = responseProfile;
    this.invertRotation = Boolean(options.invertRotation);
  }

  setInvertRotation(value) {
    this.invertRotation = Boolean(value);
  }

  push(rotationRate, timestamp, screenAngle = 0) {
    const direction = super.push(rotationRate, timestamp, screenAngle);
    return this.invertRotation ? invertDirection(direction) : direction;
  }
}

export class TiltController extends BaseTiltController {
  constructor(options = {}) {
    super(options);
    this.invertRotation = options.invertRotation ?? readStoredInvert();
    this.responseProfile = normalizeResponseProfile(options.responseProfile ?? readStoredResponseProfile());
    this.rebuildDetectors(options.sensitivity);

    this.boundRotationInvert = (event) => this.setInvertRotation(event?.detail);
    this.boundResponseProfile = (event) => this.setResponseProfile(event?.detail);
    if (typeof window !== "undefined") {
      window.addEventListener("catchum-rotation-invert", this.boundRotationInvert);
      window.addEventListener("catchum-motion-response", this.boundResponseProfile);
    }
  }

  rebuildDetectors(sensitivity = this.lateralDetector?.sensitivity ?? 1) {
    this.lateralDetector = new JoltDetector({
      sensitivity,
      responseProfile: this.responseProfile,
    });
    this.rotationalDetector = new RotationalJoltDetector({
      sensitivity,
      responseProfile: this.responseProfile,
      invertRotation: this.invertRotation,
    });
  }

  setInvertRotation(value) {
    this.invertRotation = Boolean(value);
    this.rotationalDetector.setInvertRotation(this.invertRotation);
    this.readyAnnounced = false;
  }

  setResponseProfile(value) {
    const next = normalizeResponseProfile(value);
    if (next === this.responseProfile) return;
    const sensitivity = this.lateralDetector?.sensitivity ?? 1;
    this.responseProfile = next;
    this.rebuildDetectors(sensitivity);
    if (this.enabled) {
      this.resetDetectors(`${next[0].toUpperCase()}${next.slice(1)} response — hold steady briefly…`);
    }
  }
}
