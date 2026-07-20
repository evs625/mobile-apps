import { applyGlobalForces, applyPairForce } from "./force.js";
import { clamp, mulberry32, TAU } from "./math.js";
import { SpatialHash } from "./SpatialHash.js";
import { applyTouchForce } from "./touch.js";

export class Simulation {
    config;
    width;
    height;
    particles = [];
    diagnostics = {
        pairChecks: 0,
        neighborCandidates: 0,
        touchPoints: 0,
        touchApplications: 0,
    };
    grid = new SpatialHash();
    rng = mulberry32(1);
    time = 0;
    touchPoints = [];

    constructor(config, width, height) {
        this.config = config;
        this.width = width;
        this.height = height;
        this.reset(config.seed);
    }

    setConfig(config) {
        const needsRebuild = config.particleCount !== this.config.particleCount
            || config.radius !== this.config.radius
            || config.distribution !== this.config.distribution
            || config.seed !== this.config.seed;
        this.config = config;
        if (!config.touchEnabled) {
            this.setTouchPoints([]);
        }
        if (needsRebuild) {
            this.reset(config.seed);
        }
        else {
            for (const particle of this.particles) {
                particle.radius = config.radius;
                particle.alpha = config.opacity;
            }
        }
    }

    setTouchPoints(points) {
        this.touchPoints = this.config.touchEnabled ? points : [];
        this.diagnostics.touchPoints = this.touchPoints.length;
    }

    resize(width, height) {
        const sx = width / Math.max(1, this.width);
        const sy = height / Math.max(1, this.height);
        this.width = width;
        this.height = height;
        for (const particle of this.particles) {
            particle.x *= sx;
            particle.y *= sy;
        }
    }

    reset(seed = this.config.seed) {
        this.rng = mulberry32(seed);
        this.time = 0;
        this.particles.length = 0;
        for (let i = 0; i < this.config.particleCount; i += 1) {
            const hue = (i / this.config.particleCount) * 360;
            this.particles.push(this.createParticle(i, hue));
        }
        this.shuffleHues();
    }

    step(dt) {
        const scaledDt = clamp(dt, 0, 2.5);
        this.time += scaledDt * 16.6667;
        this.diagnostics.pairChecks = 0;
        this.diagnostics.neighborCandidates = 0;
        this.diagnostics.touchApplications = 0;
        for (const particle of this.particles) {
            particle.fx = 0;
            particle.fy = 0;
        }
        this.grid.rebuild(this.particles, this.config.interactionRadius);
        for (const particle of this.particles) {
            this.diagnostics.neighborCandidates += this.grid.forNearby(particle, (other) => {
                if (applyPairForce(particle, other, this.config)) {
                    this.diagnostics.pairChecks += 1;
                }
            });
        }
        for (const particle of this.particles) {
            applyGlobalForces(particle, this.config, this.width, this.height, this.time);
            for (const touch of this.touchPoints) {
                if (applyTouchForce(particle, touch, this.config)) {
                    this.diagnostics.touchApplications += 1;
                }
            }
            this.integrate(particle, scaledDt);
            this.resolveBoundary(particle);
        }
    }

    createParticle(id, hue) {
        let x = this.rng() * this.width;
        let y = this.rng() * this.height;
        const speed = 0.4 + this.rng() * 1.2;
        const angle = this.rng() * TAU;
        if (this.config.distribution === "ring") {
            const radius = Math.min(this.width, this.height) * (0.22 + this.rng() * 0.18);
            const theta = (hue / 360) * TAU + (this.rng() - 0.5) * 0.5;
            x = this.width * 0.5 + Math.cos(theta) * radius;
            y = this.height * 0.5 + Math.sin(theta) * radius;
        }
        else if (this.config.distribution === "centerBurst") {
            const radius = Math.min(this.width, this.height) * this.rng() * 0.16;
            const theta = this.rng() * TAU;
            x = this.width * 0.5 + Math.cos(theta) * radius;
            y = this.height * 0.5 + Math.sin(theta) * radius;
        }
        return {
            id,
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            fx: 0,
            fy: 0,
            radius: this.config.radius,
            hue,
            alpha: this.config.opacity,
            mass: 1,
        };
    }

    shuffleHues() {
        const hues = this.particles.map((particle) => particle.hue);
        for (let i = hues.length - 1; i > 0; i -= 1) {
            const j = Math.floor(this.rng() * (i + 1));
            [hues[i], hues[j]] = [hues[j], hues[i]];
        }
        for (let i = 0; i < this.particles.length; i += 1) {
            this.particles[i].hue = hues[i];
        }
    }

    integrate(particle, dt) {
        particle.vx = (particle.vx + particle.fx * dt) * this.config.damping;
        particle.vy = (particle.vy + particle.fy * dt) * this.config.damping;
        const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
        if (speed > this.config.maxSpeed) {
            const scale = this.config.maxSpeed / speed;
            particle.vx *= scale;
            particle.vy *= scale;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
    }

    resolveBoundary(particle) {
        const r = particle.radius;
        if (this.config.boundaryMode === "wrap") {
            if (particle.x < -r)
                particle.x = this.width + r;
            if (particle.x > this.width + r)
                particle.x = -r;
            if (particle.y < -r)
                particle.y = this.height + r;
            if (particle.y > this.height + r)
                particle.y = -r;
            return;
        }
        if (this.config.boundaryMode === "soft") {
            const margin = Math.max(this.width, this.height) * 0.2;
            particle.x = clamp(particle.x, -margin, this.width + margin);
            particle.y = clamp(particle.y, -margin, this.height + margin);
            return;
        }
        if (particle.x < r) {
            particle.x = r;
            particle.vx = Math.abs(particle.vx) * this.config.wallRestitution;
        }
        else if (particle.x > this.width - r) {
            particle.x = this.width - r;
            particle.vx = -Math.abs(particle.vx) * this.config.wallRestitution;
        }
        if (particle.y < r) {
            particle.y = r;
            particle.vy = Math.abs(particle.vy) * this.config.wallRestitution;
        }
        else if (particle.y > this.height - r) {
            particle.y = this.height - r;
            particle.vy = -Math.abs(particle.vy) * this.config.wallRestitution;
        }
    }
}
