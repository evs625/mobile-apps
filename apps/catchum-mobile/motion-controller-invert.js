import {
  RotationalJoltDetector as BaseRotationalJoltDetector,
  TiltController as BaseTiltController,
} from "./motion-controller.js?base";

export * from "./motion-controller.js?base";

const STORAGE_KEY = "catchum-mobile-invert-rotation-v1";
const OPPOSITE = Object.freeze({
  left: "right",
  right: "left",
  up: "down",
  down: "up",
});

export function invertDirection(direction) {
  return OPPOSITE[direction] || direction || null;
}

function readStoredInvert() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export class RotationalJoltDetector extends BaseRotationalJoltDetector {
  constructor(options = {}) {
    super(options);
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
    this.rotationalDetector = new RotationalJoltDetector({
      sensitivity: options.sensitivity,
      invertRotation: this.invertRotation,
    });
    this.boundRotationInvert = (event) => this.setInvertRotation(event?.detail);
    if (typeof window !== "undefined") {
      window.addEventListener("catchum-rotation-invert", this.boundRotationInvert);
    }
  }

  setInvertRotation(value) {
    this.invertRotation = Boolean(value);
    this.rotationalDetector.setInvertRotation(this.invertRotation);
    this.readyAnnounced = false;
  }
}
