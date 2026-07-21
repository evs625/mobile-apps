import { defaultConfig, sanitizeConfig } from "./simulation/config.js";
import { GpuDensitySimulation } from "./simulation/GpuDensitySimulation.js";
import { Simulation } from "./simulation/Simulation.js";
import { WebGLRenderer } from "./render/WebGLRenderer.js";
import { clearStoredConfig, Controls, loadStoredConfig, saveConfig } from "./ui/Controls.js";

const app = document.querySelector("#app");
if (!app) throw new Error("Missing #app root.");

const shell = document.createElement("main");
const canvas = document.createElement("canvas");
const frame = document.createElement("div");
const touchLayer = document.createElement("div");
const panel = document.createElement("aside");
shell.className = "app-shell";
frame.className = "chamber-frame";
touchLayer.className = "touch-layer";
touchLayer.setAttribute("aria-hidden", "true");
canvas.setAttribute("aria-label", "Interactive particle simulation");
shell.append(canvas, frame, touchLayer, panel);
app.append(shell);

const storedConfig = loadStoredConfig();
let config = sanitizeConfig(
  { ...defaultConfig, ...storedConfig },
  interactionRadiusMaxFor({ ...defaultConfig, ...storedConfig }),
);
let chamber = computeChamber(config);
let renderer;
let simulation;
let controls;
let engineNotice = "";
let lastTime = performance.now();
let fpsTime = lastTime;
let fpsFrames = 0;
let fps = 0;
let frameMs = 0;
let singleStepRequested = false;
const activePointers = new Map();

try {
  renderer = new WebGLRenderer(canvas);
  simulation = createSimulation(config);
  controls = new Controls(panel, config, applyConfig, handleAction, interactionRadiusMax());
  controls.setEngineNotice(engineNotice);
  controls.setCollapsed(window.matchMedia("(max-width: 720px)").matches);
  updateLayout();
  requestAnimationFrame(tick);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  shell.innerHTML = `<div class="error"><strong>${message}</strong></div>`;
  throw error;
}

window.addEventListener("resize", resizeApp);
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
});
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerEnd);
canvas.addEventListener("pointercancel", handlePointerEnd);
canvas.addEventListener("lostpointercapture", handlePointerEnd);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The simulation remains fully usable when service-worker registration is blocked.
    });
  });
}

function createSimulation(requestedConfig) {
  engineNotice = "";
  if (requestedConfig.physicsEngine === "gpuField") {
    try {
      return new GpuDensitySimulation(
        requestedConfig,
        chamber.width,
        chamber.height,
        renderer.getContext(),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown WebGL2 error";
      engineNotice = `GPU density field unavailable; using CPU exact. ${reason}`;
      config = sanitizeConfig(
        { ...requestedConfig, physicsEngine: "cpu" },
        interactionRadiusMaxFor(requestedConfig),
      );
      saveConfig(config);
    }
  }
  return new Simulation(config, chamber.width, chamber.height);
}

function replaceSimulation() {
  simulation?.destroy?.();
  simulation = createSimulation(config);
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
  controls.setEngineNotice(engineNotice);
  if (previous.width !== chamber.width || previous.height !== chamber.height) updateLayout();
}

function tick(now) {
  const rawDt = (now - lastTime) / 16.6667;
  const dt = Math.min(2.5, Math.max(0, rawDt));
  lastTime = now;
  syncTouchPoints();
  const shouldStep = !document.hidden && (config.running || singleStepRequested);
  if (shouldStep) {
    simulation.step(dt);
    singleStepRequested = false;
  }
  decayPointerMotion(dt);
  const gpuState = simulation.getGpuRenderState?.();
  if (gpuState) renderer.renderGpu(gpuState, config, chamber.width, chamber.height);
  else renderer.render(simulation.particles, config, chamber.width, chamber.height);
  renderTouchIndicators();
  updateStats(now, dt);
  requestAnimationFrame(tick);
}

function applyConfig(nextConfig, rebuild) {
  const previousConfig = config;
  const wasTouchEnabled = config.touchEnabled;
  config = sanitizeConfig(nextConfig, interactionRadiusMaxFor(nextConfig));
  const nextChamber = computeChamber(config);
  config = sanitizeConfig(config, Math.max(nextChamber.width, nextChamber.height));
  saveConfig(config);
  const chamberChanged = nextChamber.width !== chamber.width || nextChamber.height !== chamber.height;
  const engineChanged = config.physicsEngine !== previousConfig.physicsEngine;
  chamber = nextChamber;
  if (!config.touchEnabled && wasTouchEnabled) clearActivePointers();
  if (rebuild || engineChanged) {
    replaceSimulation();
  } else {
    simulation.setConfig(config);
    if (chamberChanged) simulation.resize(chamber.width, chamber.height);
  }
  renderer.resize(chamber.width, chamber.height);
  updateLayout();
  controls.setInteractionRadiusMax(interactionRadiusMax());
  controls.setConfig(config);
  controls.setEngineNotice(engineNotice);
  syncTouchPoints();
  renderTouchIndicators();
}

function handleAction(action) {
  if (action === "reset") {
    simulation.reset(config.seed);
    return;
  }
  if (action === "defaults") {
    clearStoredConfig();
    clearActivePointers();
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

function handlePointerDown(event) {
  if (!config.touchEnabled || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  const position = pointerPosition(event);
  const slot = firstFreePointerSlot();
  activePointers.set(event.pointerId, {
    pointerId: event.pointerId,
    slot,
    x: position.x,
    y: position.y,
    vx: 0,
    vy: 0,
    lastTime: event.timeStamp,
  });
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail when the pointer ended before this handler completed.
  }
  syncTouchPoints();
  renderTouchIndicators();
}

function handlePointerMove(event) {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;
  event.preventDefault();
  const position = pointerPosition(event);
  const elapsedFrames = Math.max(0.25, Math.min(6, (event.timeStamp - pointer.lastTime) / 16.6667));
  const nextVx = (position.x - pointer.x) / elapsedFrames;
  const nextVy = (position.y - pointer.y) / elapsedFrames;
  pointer.vx = pointer.vx * 0.35 + nextVx * 0.65;
  pointer.vy = pointer.vy * 0.35 + nextVy * 0.65;
  pointer.x = position.x;
  pointer.y = position.y;
  pointer.lastTime = event.timeStamp;
  syncTouchPoints();
}

function handlePointerEnd(event) {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  syncTouchPoints();
  renderTouchIndicators();
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return {
    x: Math.max(0, Math.min(chamber.width, (event.clientX - rect.left) * chamber.width / width)),
    y: Math.max(0, Math.min(chamber.height, (event.clientY - rect.top) * chamber.height / height)),
  };
}

function firstFreePointerSlot() {
  const used = new Set(Array.from(activePointers.values(), ({ slot }) => slot));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

function syncTouchPoints() {
  if (!config.touchEnabled) {
    simulation.setTouchPoints([]);
    return;
  }
  simulation.setTouchPoints(Array.from(activePointers.values(), (pointer) => {
    const primary = pointer.slot % 2 === 0;
    return {
      x: pointer.x,
      y: pointer.y,
      vx: pointer.vx,
      vy: pointer.vy,
      mode: primary ? config.touchModePrimary : config.touchModeSecondary,
      strength: primary ? config.touchPrimaryStrength : config.touchSecondaryStrength,
    };
  }));
}

function decayPointerMotion(dt) {
  const decay = Math.pow(0.72, dt);
  for (const pointer of activePointers.values()) {
    pointer.vx *= decay;
    pointer.vy *= decay;
  }
}

function renderTouchIndicators() {
  if (!config.touchEnabled || !config.touchShowIndicators || activePointers.size === 0) {
    touchLayer.replaceChildren();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / Math.max(1, chamber.width);
  const scaleY = rect.height / Math.max(1, chamber.height);
  const radius = config.touchRadius * (scaleX + scaleY) * 0.5;
  const indicators = [];
  for (const pointer of activePointers.values()) {
    const primary = pointer.slot % 2 === 0;
    const mode = primary ? config.touchModePrimary : config.touchModeSecondary;
    const indicator = document.createElement("div");
    indicator.className = "touch-indicator";
    indicator.dataset.mode = mode;
    indicator.textContent = touchModeSymbol(mode);
    indicator.style.left = `${rect.left + pointer.x * scaleX}px`;
    indicator.style.top = `${rect.top + pointer.y * scaleY}px`;
    indicator.style.width = `${radius * 2}px`;
    indicator.style.height = `${radius * 2}px`;
    indicators.push(indicator);
  }
  touchLayer.replaceChildren(...indicators);
}

function touchModeSymbol(mode) {
  switch (mode) {
    case "attract": return "A";
    case "repel": return "R";
    case "vortexClockwise": return "↻";
    case "vortexCounterclockwise": return "↺";
    case "stir": return "→";
    case "brake": return "×";
    default: return "";
  }
}

function clearActivePointers() {
  for (const pointerId of activePointers.keys()) {
    try {
      canvas.releasePointerCapture(pointerId);
    } catch {
      // Ignore pointers that are no longer captured.
    }
  }
  activePointers.clear();
  simulation.setTouchPoints([]);
  touchLayer.replaceChildren();
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
      engine: simulation.engineName ?? "CPU exact",
      diagnostics: simulation.diagnostics,
    }, simulation.particleCount ?? simulation.particles.length);
  }
}

function computeChamber(currentConfig) {
  if (currentConfig.chamberUsesViewport) {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return { width: currentConfig.chamberWidth, height: currentConfig.chamberHeight };
}

function interactionRadiusMaxFor(currentConfig) {
  if (currentConfig.chamberUsesViewport ?? defaultConfig.chamberUsesViewport) {
    return Math.max(window.innerWidth, window.innerHeight);
  }
  return Math.max(
    currentConfig.chamberWidth ?? defaultConfig.chamberWidth,
    currentConfig.chamberHeight ?? defaultConfig.chamberHeight,
  );
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
