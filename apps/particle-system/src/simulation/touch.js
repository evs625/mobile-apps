const EPSILON = 0.0001;

export function applyTouchForce(particle, touch, config) {
    const dx = touch.x - particle.x;
    const dy = touch.y - particle.y;
    const distanceSq = dx * dx + dy * dy;
    const radius = config.touchRadius;

    if (distanceSq > radius * radius) {
        return false;
    }

    const distance = Math.max(EPSILON, Math.sqrt(distanceSq));
    const proximity = Math.max(0, 1 - distance / radius);
    const falloff = Math.pow(proximity, config.touchFalloff);
    const strength = touch.strength * falloff;
    const nx = dx / distance;
    const ny = dy / distance;

    switch (touch.mode) {
        case "attract":
            particle.fx += nx * strength;
            particle.fy += ny * strength;
            break;
        case "repel":
            particle.fx -= nx * strength;
            particle.fy -= ny * strength;
            break;
        case "vortexClockwise":
            particle.fx += ny * strength;
            particle.fy -= nx * strength;
            break;
        case "vortexCounterclockwise":
            particle.fx -= ny * strength;
            particle.fy += nx * strength;
            break;
        case "stir": {
            const movementScale = strength * 0.08;
            particle.fx += touch.vx * movementScale;
            particle.fy += touch.vy * movementScale;
            break;
        }
        case "brake": {
            const brakeScale = strength * 0.45;
            particle.fx -= particle.vx * brakeScale;
            particle.fy -= particle.vy * brakeScale;
            break;
        }
        default:
            return false;
    }

    return true;
}
