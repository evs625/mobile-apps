import {
  CONFIG_STORAGE_KEY,
  LEGACY_CONFIG_COOKIE_NAME,
  PHYSICS_ENGINE_OPTIONS,
  PREVIOUS_CONFIG_STORAGE_KEYS,
  presets,
  TOUCH_MODE_OPTIONS,
} from "../simulation/config.js";

const PRESERVED_SETTING_KEYS = [
  "physicsEngine",
  "gpuFieldResolution",
  "gpuFieldForceScale",
  "touchEnabled",
  "touchModePrimary",
  "touchModeSecondary",
  "touchPrimaryStrength",
  "touchSecondaryStrength",
  "touchRadius",
  "touchFalloff",
  "touchShowIndicators",
];

export class Controls {
  root;
  config;
  onChange;
  onAction;
  values = new Map();
  diagnosticsNode;
  engineNoticeNode;
  body = document.createElement("div");
  panelToggle = document.createElement("button");

  constructor(root, config, onChange, onAction, interactionRadiusMax) {
    this.root = root;
    this.config = config;
    this.onChange = onChange;
    this.onAction = onAction;
    root.className = "console";
    root.innerHTML = "";
    this.body.className = "console-body";
    this.body.append(this.createHeader());
    this.body.append(this.createPlayback());
    this.body.append(this.createPresetSection());
    this.body.append(this.createEngineSection());
    this.body.append(this.createNumberSection("Population", populationControls));
    this.body.append(this.createChamberSection());
    this.body.append(this.createNumberSection("Forces", forceControls));
    this.body.append(this.createNumberSection("Color physics", colorControls));
    this.body.append(this.createNumberSection("Shape bias", shapeControls));
    this.body.append(this.createTouchSection());
    this.body.append(this.createRenderingSection());
    this.diagnosticsNode = document.createElement("div");
    this.diagnosticsNode.className = "diagnostics";
    this.body.append(this.section("Diagnostics", this.diagnosticsNode));
    root.append(this.createPanelToggle(), this.body);
    this.setInteractionRadiusMax(interactionRadiusMax);
  }

  setCollapsed(collapsed) {
    this.root.classList.toggle("is-collapsed", collapsed);
    this.panelToggle.textContent = collapsed ? "Show controls" : "Hide controls";
    this.panelToggle.setAttribute("aria-expanded", String(!collapsed));
  }

  setConfig(config) {
    this.config = config;
    for (const [key, node] of this.values) {
      const value = config[key];
      if (node instanceof HTMLInputElement) {
        if (node.type === "checkbox") node.checked = Boolean(value);
        else node.value = String(value);
      } else if (node instanceof HTMLSelectElement) {
        node.value = String(value);
      }
      const output = node.parentElement?.querySelector("output");
      if (output) output.textContent = formatValue(value);
    }
  }

  setEngineNotice(message) {
    this.engineNoticeNode.textContent = message;
    this.engineNoticeNode.hidden = !message;
  }

  updateStats(stats, particleCount) {
    const diagnostics = stats.diagnostics;
    const physicsRows = stats.engine === "GPU density field"
      ? `
        <dt>Field grid</dt><dd>${diagnostics.fieldResolution} × ${diagnostics.fieldResolution}</dd>
        <dt>Field samples</dt><dd>${diagnostics.fieldSamples}</dd>`
      : `
        <dt>Pair checks</dt><dd>${diagnostics.pairChecks}</dd>
        <dt>Candidates</dt><dd>${diagnostics.neighborCandidates}</dd>`;
    this.diagnosticsNode.innerHTML = `
      <dl>
        <dt>Engine</dt><dd>${stats.engine}</dd>
        <dt>FPS</dt><dd>${stats.fps.toFixed(0)}</dd>
        <dt>Frame</dt><dd>${stats.frameMs.toFixed(2)} ms</dd>
        <dt>Particles</dt><dd>${particleCount}</dd>
        ${physicsRows}
        <dt>Active touches</dt><dd>${diagnostics.touchPoints}</dd>
        <dt>Touch tests</dt><dd>${diagnostics.touchApplications}</dd>
      </dl>
    `;
  }

  setInteractionRadiusMax(max) {
    const nextMax = Math.max(30, Math.round(max));
    for (const key of ["interactionRadius", "touchRadius"]) {
      const input = this.values.get(key);
      if (!(input instanceof HTMLInputElement)) continue;
      input.max = String(nextMax);
      if (Number(input.value) > nextMax) input.value = String(nextMax);
    }
  }

  createPanelToggle() {
    this.panelToggle.type = "button";
    this.panelToggle.className = "panel-toggle";
    this.panelToggle.textContent = "Hide controls";
    this.panelToggle.setAttribute("aria-expanded", "true");
    this.panelToggle.addEventListener("click", () => {
      this.setCollapsed(!this.root.classList.contains("is-collapsed"));
    });
    return this.panelToggle;
  }

  createHeader() {
    const header = document.createElement("header");
    header.innerHTML = `
      <div class="title-row">
        <div>
          <h1>Particle System Lab</h1>
          <p>Similar hues attract. Opposites repel. WebGL2 renders the chamber.</p>
        </div>
        <a class="catalog-link" href="../../" aria-label="Back to app catalog" title="Back to app catalog">←</a>
      </div>
    `;
    return header;
  }

  createPlayback() {
    const row = document.createElement("div");
    row.className = "button-grid";
    const buttons = [
      ["Start / pause", "toggle"],
      ["Stop", "stop"],
      ["Step", "step"],
      ["Reset", "reset"],
      ["Defaults", "defaults"],
    ];
    for (const [label, action] of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => this.onAction(action));
      row.append(button);
    }
    return this.section("Playback", row);
  }

  createPresetSection() {
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Simulation preset");
    for (const name of Object.keys(presets)) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const preset = presets[select.value];
      const preservedSettings = Object.fromEntries(
        PRESERVED_SETTING_KEYS.map((key) => [key, this.config[key]]),
      );
      this.onChange({ ...preset, ...preservedSettings, seed: this.config.seed }, true);
    });
    return this.section("Presets", select);
  }

  createEngineSection() {
    const fragment = document.createDocumentFragment();
    fragment.append(this.select("physicsEngine", "Physics engine", PHYSICS_ENGINE_OPTIONS, true));
    for (const control of gpuControls) fragment.append(this.range(control));
    const help = document.createElement("p");
    help.className = "control-help";
    help.textContent = "CPU exact keeps the original pairwise simulation. GPU density field approximates local interactions and is intended for large particle counts.";
    this.engineNoticeNode = document.createElement("p");
    this.engineNoticeNode.className = "engine-notice";
    this.engineNoticeNode.hidden = true;
    fragment.append(help, this.engineNoticeNode);
    return this.section("Simulation engine", fragment);
  }

  createChamberSection() {
    const fragment = document.createDocumentFragment();
    fragment.append(this.checkbox("chamberUsesViewport", "Use viewport chamber", true));
    fragment.append(this.select("boundaryMode", "Boundary", ["walls", "wrap", "soft"]));
    for (const control of chamberControls) fragment.append(this.range(control));
    return this.section("Chamber", fragment);
  }

  createTouchSection() {
    const fragment = document.createDocumentFragment();
    fragment.append(this.checkbox("touchEnabled", "Enable touch disturbances", false));
    fragment.append(this.checkbox("touchShowIndicators", "Show touch areas", false));
    fragment.append(this.select("touchModePrimary", "First finger mode", TOUCH_MODE_OPTIONS, false));
    fragment.append(this.range(touchPrimaryControls[0]));
    fragment.append(this.select("touchModeSecondary", "Second finger mode", TOUCH_MODE_OPTIONS, false));
    fragment.append(this.range(touchSecondaryControls[0]));
    for (const control of touchSharedControls) fragment.append(this.range(control));
    const help = document.createElement("p");
    help.className = "control-help";
    help.textContent = "Additional fingers alternate the first and second finger settings. Mouse and pen input use the first setting.";
    fragment.append(help);
    return this.section("Touch disturbances", fragment);
  }

  createRenderingSection() {
    const fragment = document.createDocumentFragment();
    fragment.append(this.checkbox("glow", "Glow", false));
    for (const control of renderingControls) fragment.append(this.range(control));
    return this.section("Rendering", fragment);
  }

  createNumberSection(title, controls) {
    const fragment = document.createDocumentFragment();
    for (const control of controls) fragment.append(this.range(control));
    if (title === "Population") {
      fragment.append(this.select("distribution", "Distribution", ["random", "ring", "centerBurst"]));
    }
    if (title === "Color physics") {
      fragment.append(this.checkbox("continuousHueMode", "Continuous cosine mode", false));
    }
    return this.section(title, fragment);
  }

  range(definition) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    const output = document.createElement("output");
    const input = document.createElement("input");
    span.textContent = definition.label;
    output.textContent = formatValue(this.config[definition.key]);
    input.type = "range";
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.value = String(this.config[definition.key]);
    input.setAttribute("aria-label", definition.label);
    input.addEventListener("input", () => {
      const next = { ...this.config, [definition.key]: Number(input.value) };
      output.textContent = formatValue(next[definition.key]);
      this.onChange(next, Boolean(definition.rebuild));
    });
    this.values.set(definition.key, input);
    label.append(span, output, input);
    return label;
  }

  checkbox(key, labelText, rebuild) {
    const label = document.createElement("label");
    label.className = "toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(this.config[key]);
    input.addEventListener("change", () => {
      this.onChange({ ...this.config, [key]: input.checked }, rebuild);
    });
    this.values.set(key, input);
    label.append(input, document.createTextNode(labelText));
    return label;
  }

  select(key, labelText, options, rebuild = true) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    const select = document.createElement("select");
    span.textContent = labelText;
    select.setAttribute("aria-label", labelText);
    for (const optionDefinition of options) {
      const value = typeof optionDefinition === "string" ? optionDefinition : optionDefinition.value;
      const text = typeof optionDefinition === "string" ? optionDefinition : optionDefinition.label;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = String(this.config[key]);
    select.addEventListener("change", () => {
      this.onChange({ ...this.config, [key]: select.value }, rebuild);
    });
    this.values.set(key, select);
    label.append(span, select);
    return label;
  }

  section(title, content) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = title;
    section.append(heading, content);
    return section;
  }
}

const gpuControls = [
  { key: "gpuFieldResolution", label: "GPU field resolution", min: 64, max: 256, step: 32, rebuild: true },
  { key: "gpuFieldForceScale", label: "GPU field force", min: 0.1, max: 3, step: 0.05 },
];

const populationControls = [
  { key: "particleCount", label: "Particles", min: 50, max: 5000, step: 10, rebuild: true },
  { key: "radius", label: "Radius", min: 1, max: 9, step: 0.1, rebuild: true },
  { key: "seed", label: "Seed", min: 1, max: 2147483647, step: 1, rebuild: true },
];

const chamberControls = [
  { key: "chamberWidth", label: "Width", min: 240, max: 4000, step: 10 },
  { key: "chamberHeight", label: "Height", min: 180, max: 3000, step: 10 },
  { key: "wallRestitution", label: "Wall bounce", min: 0, max: 1, step: 0.01 },
  { key: "centerPull", label: "Center pull", min: 0, max: 0.01, step: 0.0001 },
];

const forceControls = [
  { key: "interactionRadius", label: "Interaction radius", min: 12, max: 160, step: 1 },
  { key: "attractionStrength", label: "Attraction", min: 0, max: 0.08, step: 0.0005 },
  { key: "repulsionStrength", label: "Repulsion", min: 0, max: 0.12, step: 0.0005 },
  { key: "forceSoftening", label: "Force softening", min: 1, max: 240, step: 1 },
  { key: "collisionStrength", label: "Collision", min: 0, max: 4, step: 0.01 },
  { key: "damping", label: "Damping", min: 0.75, max: 0.995, step: 0.001 },
  { key: "maxSpeed", label: "Max speed", min: 0.5, max: 18, step: 0.1 },
];

const colorControls = [
  { key: "attractionHueThreshold", label: "Attract hue", min: 0, max: 180, step: 1 },
  { key: "repulsionHueThreshold", label: "Repel hue", min: 0, max: 180, step: 1 },
];

const shapeControls = [
  { key: "wheelBias", label: "Wheel bias", min: 0, max: 0.02, step: 0.0001 },
  { key: "swirlStrength", label: "Swirl", min: -0.02, max: 0.02, step: 0.0001 },
  { key: "breathingAmplitude", label: "Breathing", min: 0, max: 1, step: 0.01 },
];

const touchPrimaryControls = [
  { key: "touchPrimaryStrength", label: "First finger strength", min: 0.01, max: 1.5, step: 0.01 },
];

const touchSecondaryControls = [
  { key: "touchSecondaryStrength", label: "Second finger strength", min: 0.01, max: 1.5, step: 0.01 },
];

const touchSharedControls = [
  { key: "touchRadius", label: "Touch radius", min: 30, max: 240, step: 5 },
  { key: "touchFalloff", label: "Edge falloff", min: 0.5, max: 4, step: 0.1 },
];

const renderingControls = [
  { key: "opacity", label: "Opacity", min: 0.1, max: 1, step: 0.01 },
  { key: "trailFade", label: "Trail fade", min: 0.02, max: 1, step: 0.01 },
  { key: "backgroundFade", label: "Background fade", min: 0, max: 1, step: 0.01 },
];

function formatValue(value) {
  return typeof value === "number" ? Number(value.toFixed(4)).toString() : String(value);
}

export function loadStoredConfig() {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    for (const previousKey of PREVIOUS_CONFIG_STORAGE_KEYS) {
      const previous = localStorage.getItem(previousKey);
      if (!previous) continue;
      const parsed = JSON.parse(previous);
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(parsed));
      for (const key of PREVIOUS_CONFIG_STORAGE_KEYS) localStorage.removeItem(key);
      return parsed;
    }
    const legacy = readCookie(LEGACY_CONFIG_COOKIE_NAME);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy);
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(parsed));
    clearCookie(LEGACY_CONFIG_COOKIE_NAME);
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage can be unavailable in private or restricted browser modes.
  }
}

export function clearStoredConfig() {
  try {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    for (const key of PREVIOUS_CONFIG_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
  clearCookie(LEGACY_CONFIG_COOKIE_NAME);
}

function readCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function clearCookie(name) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}
