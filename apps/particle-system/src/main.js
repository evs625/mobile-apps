import { defaultConfig, sanitizeConfig } from "./simulation/config.js";
import { Simulation } from "./simulation/Simulation.js";
import { WebGLRenderer } from "./render/WebGLRenderer.js";
import { clearStoredConfig, Controls, loadStoredConfig, saveConfig } from "./ui/Controls.js";
const app = document.querySelector("#app");
if (!app)
    throw new Error("Missing #app root.");
const shell = document.createElement("main");
const canvas = document.createElement("canvas");
const frame = document.createElement("div");
const panel = document.createElement("aside");
shell.className = "app-shell";
frame.className = "chamber-frame";
canvas.setAttribute("aria-label", "Interactive particle simulation");
shell.append(canvas, frame, panel);
app.append(shell);
const storedConfig = loadStoredConfig();
let config = sanitizeConfig({ ...defaultConfig, ...storedConfig }, interactionRadiusMaxFor({ ...defaultConfig, ...storedConfig }));
let chamber = computeChamber(config);
let simulation = new Simulation(config, chamber.width, chamber.height);
let renderer;
let controls;
let lastTime = performance.now();
let fpsTime = lastTime;
let fpsFrames = 0;
let fps = 0;
let frameMs = 0;
let singleStepRequested = false;
try {
    renderer = new WebGLRenderer(canvas);
    controls = new Controls(panel, config, applyConfig, handleAction, interactionRadiusMax());
    controls.setCollapsed(window.matchMedia("(max-width: 720px)").matches);
    updateLayout();
    requestAnimationFrame(tick);
}
catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup error.";
    shell.innerHTML = `<div class="error"><strong>${message}</strong></div>`;
    throw error;
}
window.addEventListener("resize", resizeApp);
document.addEventListener("visibilitychange", () => {
    lastTime = performance.now();
});
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {
            // The simulation remains fully usable when service-worker registration is blocked.
        });
    });
}
function resizeApp() {
    const previous = chamber;
    config = sanitizeConfig(config, interactionRadiusMaxFor(config));
    chamber = computeChamber(config);
    renderer.resize(chamber.width, chamber.height);
    simulation.setConfig(config);
    simulation.resize(chamber.width, chamber.height);
    controls.setInteractionRadiusMax(interactionRadiusMax());
    controls.setConfig(config);
    if (previous.width !== chamber.width || previous.height !== chamber.height)
        updateLayout();
}
function tick(now) {
    const rawDt = (now - lastTime) / 16.6667;
    const dt = Math.min(2.5, Math.max(0, rawDt));
    lastTime = now;
    const shouldStep = !document.hidden && (config.running || singleStepRequested);
    if (shouldStep) {
        simulation.step(dt);
        singleStepRequested = false;
    }
    renderer.render(simulation.particles, config, chamber.width, chamber.height);
    updateStats(now, dt);
    requestAnimationFrame(tick);
}
function applyConfig(nextConfig, rebuild) {
    config = sanitizeConfig(nextConfig, interactionRadiusMaxFor(nextConfig));
    const nextChamber = computeChamber(config);
    config = sanitizeConfig(config, Math.max(nextChamber.width, nextChamber.height));
    saveConfig(config);
    const chamberChanged = nextChamber.width !== chamber.width || nextChamber.height !== chamber.height;
    chamber = nextChamber;
    if (rebuild) {
        simulation = new Simulation(config, chamber.width, chamber.height);
    }
    else {
        simulation.setConfig(config);
        if (chamberChanged)
            simulation.resize(chamber.width, chamber.height);
    }
    renderer.resize(chamber.width, chamber.height);
    updateLayout();
    controls.setInteractionRadiusMax(interactionRadiusMax());
    controls.setConfig(config);
}
function handleAction(action) {
    if (action === "reset") {
        simulation.reset(config.seed);
        return;
    }
    if (action === "defaults") {
        clearStoredConfig();
        applyConfig({ ...defaultConfig }, true);
        return;
    }
    if (action === "step") {
        singleStepRequested = true;
        config = { ...config, running: false };
        controls.setConfig(config);
        saveConfig(config);
        return;
    }
    if (action === "stop") {
        config = { ...config, running: false };
        simulation.reset(config.seed);
        controls.setConfig(config);
        saveConfig(config);
        return;
    }
    config = { ...config, running: !config.running };
    controls.setConfig(config);
    saveConfig(config);
}
function updateStats(now, dt) {
    frameMs = dt * 16.6667;
    fpsFrames += 1;
    if (now - fpsTime >= 300) {
        fps = fpsFrames * 1000 / (now - fpsTime);
        fpsFrames = 0;
        fpsTime = now;
        controls.updateStats({
            fps,
            frameMs,
            diagnostics: simulation.diagnostics,
        }, simulation.particles.length);
    }
}
function computeChamber(currentConfig) {
    if (currentConfig.chamberUsesViewport) {
        return {
            width: window.innerWidth,
            height: window.innerHeight,
        };
    }
    return {
        width: currentConfig.chamberWidth,
        height: currentConfig.chamberHeight,
    };
}
function interactionRadiusMaxFor(currentConfig) {
    if (currentConfig.chamberUsesViewport ?? defaultConfig.chamberUsesViewport) {
        return Math.max(window.innerWidth, window.innerHeight);
    }
    return Math.max(currentConfig.chamberWidth ?? defaultConfig.chamberWidth, currentConfig.chamberHeight ?? defaultConfig.chamberHeight);
}
function interactionRadiusMax() {
    return Math.max(chamber.width, chamber.height);
}
function updateLayout() {
    renderer.resize(chamber.width, chamber.height);
    canvas.style.width = `${chamber.width}px`;
    canvas.style.height = `${chamber.height}px`;
    canvas.style.left = `${Math.max(0, (window.innerWidth - chamber.width) * 0.5)}px`;
    canvas.style.top = `${Math.max(0, (window.innerHeight - chamber.height) * 0.5)}px`;
    frame.style.width = canvas.style.width;
    frame.style.height = canvas.style.height;
    frame.style.left = canvas.style.left;
    frame.style.top = canvas.style.top;
}
