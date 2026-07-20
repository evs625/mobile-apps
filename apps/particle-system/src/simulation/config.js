export const CONFIG_STORAGE_KEY = "mobile-apps:particle-system:config:v3";
export const PREVIOUS_CONFIG_STORAGE_KEY = "mobile-apps:particle-system:config:v2";
export const LEGACY_CONFIG_COOKIE_NAME = "webgl-particle-system-config-v1";

export const TOUCH_MODE_OPTIONS = [
    { value: "attract", label: "Attract" },
    { value: "repel", label: "Repel" },
    { value: "vortexClockwise", label: "Vortex clockwise" },
    { value: "vortexCounterclockwise", label: "Vortex counter-clockwise" },
    { value: "stir", label: "Move with finger" },
    { value: "brake", label: "Slow particles" },
];

const TOUCH_MODES = new Set(TOUCH_MODE_OPTIONS.map(({ value }) => value));

export const defaultConfig = {
    particleCount: 800,
    radius: 3.2,
    interactionRadius: 58,
    attractionStrength: 0.006,
    repulsionStrength: 0.009,
    forceSoftening: 24,
    collisionStrength: 1.1,
    damping: 0.93,
    maxSpeed: 5.5,
    wallRestitution: 0.46,
    centerPull: 0.0008,
    wheelBias: 0.0015,
    swirlStrength: 0.0014,
    breathingAmplitude: 0.12,
    attractionHueThreshold: 62,
    repulsionHueThreshold: 118,
    continuousHueMode: true,
    boundaryMode: "walls",
    distribution: "random",
    chamberUsesViewport: true,
    chamberWidth: 1200,
    chamberHeight: 780,
    seed: 6252026,
    running: true,
    glow: true,
    opacity: 0.92,
    trailFade: 0.18,
    backgroundFade: 0.3,
    touchEnabled: false,
    touchModePrimary: "attract",
    touchModeSecondary: "repel",
    touchPrimaryStrength: 0.24,
    touchSecondaryStrength: 0.24,
    touchRadius: 140,
    touchFalloff: 2,
    touchShowIndicators: true,
};

export const presets = {
    "Color wheel": { ...defaultConfig },
    "Calm clustering": {
        ...defaultConfig,
        particleCount: 650,
        attractionStrength: 0.004,
        repulsionStrength: 0.006,
        forceSoftening: 30,
        damping: 0.95,
        wheelBias: 0.0007,
        swirlStrength: 0.0005,
        breathingAmplitude: 0.05,
        trailFade: 0.22,
    },
    "Fast chaos": {
        ...defaultConfig,
        particleCount: 900,
        attractionStrength: 0.009,
        repulsionStrength: 0.014,
        forceSoftening: 20,
        collisionStrength: 1.6,
        damping: 0.89,
        maxSpeed: 8,
        wheelBias: 0.0003,
        swirlStrength: 0.0035,
        trailFade: 0.11,
    },
    "Dense plasma": {
        ...defaultConfig,
        particleCount: 1600,
        radius: 2.4,
        interactionRadius: 42,
        attractionStrength: 0.005,
        repulsionStrength: 0.007,
        forceSoftening: 22,
        collisionStrength: 0.85,
        damping: 0.925,
        wheelBias: 0.0011,
        opacity: 0.76,
        trailFade: 0.08,
    },
    "Mobile safe": {
        ...defaultConfig,
        particleCount: 350,
        radius: 3.4,
        interactionRadius: 54,
        attractionStrength: 0.006,
        repulsionStrength: 0.009,
        forceSoftening: 24,
        damping: 0.93,
        wheelBias: 0.0018,
    },
};

export function sanitizeConfig(input, interactionRadiusMax = 4000) {
    const safeInteractionRadiusMax = Math.max(12, interactionRadiusMax);
    return {
        ...defaultConfig,
        ...input,
        particleCount: clampInt(input.particleCount ?? defaultConfig.particleCount, 50, 5000),
        radius: clampNumber(input.radius ?? defaultConfig.radius, 1, 9),
        interactionRadius: clampNumber(input.interactionRadius ?? defaultConfig.interactionRadius, 12, safeInteractionRadiusMax),
        attractionStrength: clampNumber(input.attractionStrength ?? defaultConfig.attractionStrength, 0, 0.08),
        repulsionStrength: clampNumber(input.repulsionStrength ?? defaultConfig.repulsionStrength, 0, 0.12),
        forceSoftening: clampNumber(input.forceSoftening ?? defaultConfig.forceSoftening, 1, 240),
        collisionStrength: clampNumber(input.collisionStrength ?? defaultConfig.collisionStrength, 0, 4),
        damping: clampNumber(input.damping ?? defaultConfig.damping, 0.75, 0.995),
        maxSpeed: clampNumber(input.maxSpeed ?? defaultConfig.maxSpeed, 0.5, 18),
        wallRestitution: clampNumber(input.wallRestitution ?? defaultConfig.wallRestitution, 0, 1),
        centerPull: clampNumber(input.centerPull ?? defaultConfig.centerPull, 0, 0.01),
        wheelBias: clampNumber(input.wheelBias ?? defaultConfig.wheelBias, 0, 0.02),
        swirlStrength: clampNumber(input.swirlStrength ?? defaultConfig.swirlStrength, -0.02, 0.02),
        breathingAmplitude: clampNumber(input.breathingAmplitude ?? defaultConfig.breathingAmplitude, 0, 1),
        attractionHueThreshold: clampNumber(input.attractionHueThreshold ?? defaultConfig.attractionHueThreshold, 0, 180),
        repulsionHueThreshold: clampNumber(input.repulsionHueThreshold ?? defaultConfig.repulsionHueThreshold, 0, 180),
        chamberWidth: clampInt(input.chamberWidth ?? defaultConfig.chamberWidth, 240, 4000),
        chamberHeight: clampInt(input.chamberHeight ?? defaultConfig.chamberHeight, 180, 3000),
        seed: clampInt(input.seed ?? defaultConfig.seed, 1, 2147483647),
        touchEnabled: Boolean(input.touchEnabled ?? defaultConfig.touchEnabled),
        touchModePrimary: sanitizeTouchMode(input.touchModePrimary, defaultConfig.touchModePrimary),
        touchModeSecondary: sanitizeTouchMode(input.touchModeSecondary, defaultConfig.touchModeSecondary),
        touchPrimaryStrength: clampNumber(input.touchPrimaryStrength ?? defaultConfig.touchPrimaryStrength, 0.01, 1.5),
        touchSecondaryStrength: clampNumber(input.touchSecondaryStrength ?? defaultConfig.touchSecondaryStrength, 0.01, 1.5),
        touchRadius: clampNumber(input.touchRadius ?? defaultConfig.touchRadius, 30, Math.max(30, safeInteractionRadiusMax)),
        touchFalloff: clampNumber(input.touchFalloff ?? defaultConfig.touchFalloff, 0.5, 4),
        touchShowIndicators: Boolean(input.touchShowIndicators ?? defaultConfig.touchShowIndicators),
    };
}

function sanitizeTouchMode(value, fallback) {
    return TOUCH_MODES.has(value) ? value : fallback;
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampInt(value, min, max) {
    return Math.round(clampNumber(value, min, max));
}
