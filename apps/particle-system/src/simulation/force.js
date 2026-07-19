import { hueDistance, TAU } from "./math.js";
const EPSILON = 0.0001;
export function applyPairForce(a, b, config) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distanceSq = dx * dx + dy * dy;
    const maxDistance = config.interactionRadius;
    if (distanceSq > maxDistance * maxDistance)
        return false;
    const distance = Math.max(EPSILON, Math.sqrt(distanceSq));
    const nx = dx / distance;
    const ny = dy / distance;
    const collisionDistance = Math.max(EPSILON, (a.radius + b.radius) * 1.05);
    let force = 0;
    if (distance < collisionDistance) {
        force -= config.collisionStrength * (1 - distance / collisionDistance);
    }
    const deltaHue = hueDistance(a.hue, b.hue);
    const softeningSq = config.forceSoftening * config.forceSoftening;
    const inverseSquare = (maxDistance * maxDistance) / (distanceSq + softeningSq);
    if (config.continuousHueMode) {
        const affinity = Math.cos((deltaHue / 180) * Math.PI);
        force += affinity >= 0
            ? affinity * config.attractionStrength * inverseSquare
            : affinity * config.repulsionStrength * inverseSquare;
    }
    else if (deltaHue <= config.attractionHueThreshold) {
        const hueT = 1 - deltaHue / Math.max(1, config.attractionHueThreshold);
        force += hueT * config.attractionStrength * inverseSquare;
    }
    else if (deltaHue >= config.repulsionHueThreshold) {
        const hueT = (deltaHue - config.repulsionHueThreshold) / Math.max(1, 180 - config.repulsionHueThreshold);
        force -= hueT * config.repulsionStrength * inverseSquare;
    }
    a.fx += nx * force;
    a.fy += ny * force;
    b.fx -= nx * force;
    b.fy -= ny * force;
    return true;
}
export function applyGlobalForces(particle, config, width, height, time) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const dx = cx - particle.x;
    const dy = cy - particle.y;
    particle.fx += dx * config.centerPull;
    particle.fy += dy * config.centerPull;
    if (config.wheelBias > 0) {
        const baseRadius = Math.min(width, height) * 0.31;
        const breathing = 1 + Math.sin(time * 0.0014 + particle.hue * 0.03) * config.breathingAmplitude * 0.08;
        const angle = (particle.hue / 360) * TAU + time * 0.00008;
        const targetX = cx + Math.cos(angle) * baseRadius * breathing;
        const targetY = cy + Math.sin(angle) * baseRadius * breathing;
        particle.fx += (targetX - particle.x) * config.wheelBias;
        particle.fy += (targetY - particle.y) * config.wheelBias;
    }
    if (config.swirlStrength !== 0) {
        const sx = particle.x - cx;
        const sy = particle.y - cy;
        const invRadius = 1 / Math.max(120, Math.sqrt(sx * sx + sy * sy));
        particle.fx += -sy * invRadius * config.swirlStrength;
        particle.fy += sx * invRadius * config.swirlStrength;
    }
}
