const STORAGE_KEY = "catchum-mobile-touch-controller-v1";
const CONTROLLER_MODES = new Set(["dpad", "swipe"]);
const ARROW_KEYS = Object.freeze({
  up: "ArrowUp",
  left: "ArrowLeft",
  down: "ArrowDown",
  right: "ArrowRight",
});

export function normalizeTouchControllerMode(value) {
  return CONTROLLER_MODES.has(value) ? value : "dpad";
}

export function swipeThreshold(width, height) {
  const shortSide = Math.max(0, Math.min(Number(width) || 0, Number(height) || 0));
  return Math.max(14, shortSide * 0.12);
}

export function resolveSwipeDirection(dx, dy, threshold = 18) {
  const horizontal = Number(dx) || 0;
  const vertical = Number(dy) || 0;
  const minimum = Math.max(0, Number(threshold) || 0);
  if (Math.hypot(horizontal, vertical) < minimum) return null;
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal >= 0 ? "right" : "left";
  return vertical >= 0 ? "down" : "up";
}

function readStoredMode() {
  try {
    return normalizeTouchControllerMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "dpad";
  }
}

function storeMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeTouchControllerMode(mode));
  } catch {
    // The selected mode remains active for this page if storage is blocked.
  }
}

function dispatchDirection(direction) {
  const key = ARROW_KEYS[direction];
  if (!key) return;
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  }));
}

export class SwipePadController {
  constructor(element, {
    onDirection = dispatchDirection,
    minimumIntervalMs = 65,
  } = {}) {
    this.element = element;
    this.onDirection = onDirection;
    this.minimumIntervalMs = minimumIntervalMs;
    this.pointerId = null;
    this.anchor = null;
    this.lastEmitAt = Number.NEGATIVE_INFINITY;
    this.resetTimer = null;

    this.handlePointerDown = (event) => this.pointerDown(event);
    this.handlePointerMove = (event) => this.pointerMove(event);
    this.handlePointerEnd = (event) => this.pointerEnd(event);

    element.addEventListener("pointerdown", this.handlePointerDown);
    element.addEventListener("pointermove", this.handlePointerMove, { passive: false });
    element.addEventListener("pointerup", this.handlePointerEnd);
    element.addEventListener("pointercancel", this.handlePointerEnd);
    element.addEventListener("lostpointercapture", this.handlePointerEnd);
  }

  pointFromEvent(event) {
    const samples = event.getCoalescedEvents?.();
    const sample = samples?.length ? samples[samples.length - 1] : event;
    return { x: sample.clientX, y: sample.clientY };
  }

  pointerDown(event) {
    if (this.pointerId !== null || event.button > 0) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.anchor = this.pointFromEvent(event);
    this.element.setPointerCapture?.(event.pointerId);
    this.element.classList.add("active");
    this.updateThumb(event);
  }

  pointerMove(event) {
    if (event.pointerId !== this.pointerId || !this.anchor) return;
    event.preventDefault();
    const point = this.pointFromEvent(event);
    this.updateThumbPoint(point);

    const rect = this.element.getBoundingClientRect();
    const threshold = swipeThreshold(rect.width, rect.height);
    const direction = resolveSwipeDirection(point.x - this.anchor.x, point.y - this.anchor.y, threshold);
    const now = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    if (!direction || now - this.lastEmitAt < this.minimumIntervalMs) return;

    this.lastEmitAt = now;
    this.anchor = point;
    this.showDirection(direction);
    this.onDirection(direction);
  }

  pointerEnd(event) {
    if (event.pointerId !== this.pointerId) return;
    this.element.releasePointerCapture?.(event.pointerId);
    this.pointerId = null;
    this.anchor = null;
    this.element.classList.remove("active");
    this.resetThumb();
  }

  updateThumb(event) {
    this.updateThumbPoint(this.pointFromEvent(event));
  }

  updateThumbPoint(point) {
    const rect = this.element.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, point.x - rect.left));
    const y = Math.max(0, Math.min(rect.height, point.y - rect.top));
    this.element.style.setProperty("--thumb-x", `${x}px`);
    this.element.style.setProperty("--thumb-y", `${y}px`);
  }

  resetThumb() {
    this.element.style.removeProperty("--thumb-x");
    this.element.style.removeProperty("--thumb-y");
  }

  showDirection(direction) {
    this.element.dataset.direction = direction;
    const label = this.element.querySelector("[data-swipe-label]");
    if (label) label.textContent = direction.toUpperCase();
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.element.removeAttribute("data-direction");
      if (label) label.textContent = "SLIDE";
    }, 240);
  }
}

function createSwipePad() {
  const pad = document.createElement("div");
  pad.className = "swipe-pad";
  pad.hidden = true;
  pad.tabIndex = 0;
  pad.setAttribute("role", "application");
  pad.setAttribute("aria-label", "Swipe direction pad. Slide your thumb up, down, left, or right to move.");
  pad.innerHTML = `
    <span class="swipe-arrow up" aria-hidden="true">▲</span>
    <span class="swipe-arrow left" aria-hidden="true">◀</span>
    <span class="swipe-arrow right" aria-hidden="true">▶</span>
    <span class="swipe-arrow down" aria-hidden="true">▼</span>
    <span class="swipe-label" data-swipe-label>SLIDE</span>
    <span class="swipe-thumb" aria-hidden="true"></span>
  `;
  return pad;
}

function installTouchController() {
  const dpad = document.querySelector(".dpad");
  const sideRow = document.querySelector("[data-side-toggle]")?.closest("label");
  if (!dpad || !sideRow) return;

  const swipePad = createSwipePad();
  dpad.insertAdjacentElement("afterend", swipePad);
  new SwipePadController(swipePad);

  const row = document.createElement("label");
  row.className = "select-row";
  row.innerHTML = `
    <span>Touch controller</span>
    <select data-touch-controller-mode>
      <option value="dpad">D-pad buttons</option>
      <option value="swipe">Swipe pad</option>
    </select>
  `;
  sideRow.insertAdjacentElement("beforebegin", row);
  const select = row.querySelector("[data-touch-controller-mode]");

  const applyMode = (value) => {
    const mode = normalizeTouchControllerMode(value);
    select.value = mode;
    dpad.hidden = mode !== "dpad";
    swipePad.hidden = mode !== "swipe";
    document.querySelector("[data-shell]")?.classList.toggle("swipe-controller", mode === "swipe");
    return mode;
  };

  applyMode(readStoredMode());
  select.addEventListener("change", () => storeMode(applyMode(select.value)));

  const instructions = document.querySelector("[data-instructions] article");
  const buttonParagraph = [...(instructions?.querySelectorAll("p") || [])]
    .find((paragraph) => paragraph.textContent.trim().startsWith("Buttons:"));
  if (buttonParagraph) {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<strong>Swipe pad:</strong> place your thumb anywhere in the pad and slide in a direction. The reference point resets after each accepted slide, so several turns can be entered without lifting your thumb.";
    buttonParagraph.insertAdjacentElement("beforebegin", paragraph);
  }
}

if (typeof document !== "undefined") installTouchController();
