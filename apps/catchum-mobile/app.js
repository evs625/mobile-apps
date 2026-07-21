import {
  CatChumGame,
  DEFAULT_HIGH_SCORES,
  MAZE_HEIGHT,
  MAZE_SOURCE,
  MAZE_WIDTH,
  availableDirections,
  chooseTargetDirection,
  displayTile,
  insertHighScore,
  movePosition,
  normalizeHighScores,
  opposite,
} from "./engine.js";
import { TiltController } from "./tilt.js";
import {
  DIRECTION_VECTORS,
  clamp01,
  interpolatePosition,
  remainingProgress,
  wrappedRenderPositions,
} from "./visual-motion.js";

const STORAGE_KEY = "catchum-mobile-v1";
const canvas = document.querySelector("[data-game]");
const context = canvas.getContext("2d", { alpha: false });
const shell = document.querySelector("[data-shell]");
const statusPanel = document.querySelector("[data-status-panel]");
const tiltStatus = document.querySelector("[data-tilt-status]");
const menu = document.querySelector("[data-menu]");
const instructionsDialog = document.querySelector("[data-instructions]");
const scoresDialog = document.querySelector("[data-scores]");
const nameDialog = document.querySelector("[data-name-dialog]");
const rotateOverlay = document.querySelector("[data-rotate]");
const playerButtons = [...document.querySelectorAll("[data-players]")];
const difficultyInput = document.querySelector("[data-difficulty]");
const difficultyValue = document.querySelector("[data-difficulty-value]");
const sensitivityInput = document.querySelector("[data-sensitivity]");
const sensitivityValue = document.querySelector("[data-sensitivity-value]");
const tiltToggle = document.querySelector("[data-tilt-toggle]");
const sideToggle = document.querySelector("[data-side-toggle]");
const resumeButton = document.querySelector("[data-resume]");

let settings = loadSettings();
let game = null;
let running = false;
let accumulator = 0;
let lastFrame = performance.now();
let highScorePrompted = false;
let queuedTurnRequest = null;
let catVisualOverride = null;

const queuedTurnStyle = document.createElement("style");
queuedTurnStyle.textContent = ".dpad button.queued-turn{border-color:#ffe979;box-shadow:0 0 0 2px rgba(255,233,121,.28),inset 0 0 12px rgba(255,233,121,.22)}";
document.head.append(queuedTurnStyle);

const tiltController = new TiltController({
  sensitivity: settings.sensitivity,
  onDirection: handleJoltDirection,
  onStatus: (message) => { tiltStatus.textContent = message; },
});

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      players: parsed.players === 2 ? 2 : 1,
      difficulty: Math.max(1, Math.min(9, Number(parsed.difficulty) || 1)),
      sensitivity: Math.max(0.65, Math.min(1.6, Number(parsed.sensitivity) || 1)),
      tiltEnabled: parsed.tiltEnabled !== false,
      dpadSide: parsed.dpadSide === "left" ? "left" : "right",
      highScores: normalizeHighScores(parsed.highScores?.length ? parsed.highScores : DEFAULT_HIGH_SCORES),
    };
  } catch {
    return { players: 1, difficulty: 1, sensitivity: 1, tiltEnabled: true, dpadSide: "right", highScores: [...DEFAULT_HIGH_SCORES] };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettingsToUi() {
  playerButtons.forEach((button) => button.classList.toggle("selected", Number(button.dataset.players) === settings.players));
  difficultyInput.value = String(settings.difficulty);
  difficultyValue.textContent = String(settings.difficulty);
  sensitivityInput.value = String(settings.sensitivity);
  sensitivityValue.textContent = `${settings.sensitivity.toFixed(2)}×`;
  tiltToggle.checked = settings.tiltEnabled;
  sideToggle.value = settings.dpadSide;
  shell.classList.toggle("dpad-left", settings.dpadSide === "left");
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function showMenu() {
  if (game?.phase === "playing") game.togglePause();
  resumeButton.hidden = !game || game.phase === "game-over";
  openDialog(menu);
}

function resumeGame() {
  closeDialog(menu);
  if (game?.phase === "paused") game.togglePause();
}

async function startGame() {
  settings.players = Number(document.querySelector("[data-players].selected")?.dataset.players) === 2 ? 2 : 1;
  settings.difficulty = Number(difficultyInput.value);
  settings.sensitivity = Number(sensitivityInput.value);
  settings.tiltEnabled = tiltToggle.checked;
  settings.dpadSide = sideToggle.value;
  saveSettings();
  applySettingsToUi();

  game = new CatChumGame({ players: settings.players, difficulty: settings.difficulty });
  highScorePrompted = false;
  running = true;
  accumulator = 0;
  lastFrame = performance.now();
  catVisualOverride = null;
  clearQueuedTurn();
  closeDialog(menu);

  if (settings.tiltEnabled) {
    tiltController.setSensitivity(settings.sensitivity);
    await tiltController.enable();
  } else {
    tiltController.disable();
  }

  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
  } catch {
    // Fullscreen is optional.
  }
  try {
    await screen.orientation?.lock?.("landscape");
  } catch {
    // Browsers that cannot lock orientation use the rotate overlay.
  }
  resizeCanvas();
  render();
}

function estimatedAccumulator() {
  if (!running || !game) return accumulator;
  return accumulator + Math.max(0, performance.now() - lastFrame);
}

function currentMotionProgress() {
  if (!game || game.phase !== "playing") return 0;
  return clamp01(estimatedAccumulator() / game.intervalMs);
}

function actorTarget(position, directionName, actor) {
  const direction = DIRECTION_VECTORS[directionName];
  if (!direction) return null;
  const logicalTarget = movePosition(position, direction);
  if (!game.canEnter(logicalTarget, actor)) return null;
  return {
    x: position.x + direction.dx,
    y: position.y + direction.dy,
  };
}

function catRenderPosition(progress = currentMotionProgress()) {
  if (!game) return null;
  const position = game.cat.position;
  if (game.phase !== "playing") return { ...position };

  if (catVisualOverride?.stepCount === game.stepCount) {
    return interpolatePosition(
      catVisualOverride.from,
      catVisualOverride.to,
      remainingProgress(progress, catVisualOverride.startProgress),
    );
  }

  const queuedTarget = actorTarget(position, game.cat.queuedDirection.name, "cat");
  const target = queuedTarget || actorTarget(position, game.cat.direction.name, "cat");
  return target ? interpolatePosition(position, target, progress) : { ...position };
}

function predictedGhostDirection(ghost) {
  if (!game || !ghost?.released || game.phase !== "playing") return null;
  const frightenedNext = game.timeMs + game.intervalMs < game.frightenedUntil;
  if (frightenedNext && (game.stepCount + 1) % 2 === 0 && !ghost.eaten) return null;
  if (ghost.eaten && ghost.position.x === 24 && ghost.position.y === 11) return null;

  const legal = availableDirections(game.tiles, ghost.position, "ghost");
  if (!legal.length) return null;
  const reverse = opposite(ghost.direction);
  const pool = legal.filter((direction) => direction.name !== reverse?.name);
  const candidates = pool.length ? pool : legal;

  if (frightenedNext && !ghost.eaten) {
    return candidates.find((direction) => direction.name === ghost.direction.name) || candidates[0];
  }

  const target = ghost.eaten ? { x: 24, y: 11 } : game.ghostTarget(ghost);
  return chooseTargetDirection(game.tiles, ghost.position, ghost.direction, target, "ghost");
}

function ghostRenderPosition(index, progress = currentMotionProgress()) {
  const ghost = game?.ghosts[index];
  if (!ghost || game.phase !== "playing") return ghost ? { ...ghost.position } : null;
  const direction = predictedGhostDirection(ghost);
  const target = direction ? actorTarget(ghost.position, direction.name, "ghost") : null;
  return target ? interpolatePosition(ghost.position, target, progress) : { ...ghost.position };
}

function queueDirection(direction) {
  if (!game) return;
  const progress = currentMotionProgress();
  const currentVisualPosition = catRenderPosition(progress);
  game.queueDirection(direction);
  queuedTurnRequest = { direction, stepCount: game.stepCount };
  showQueuedTurn(direction);

  if (game.phase !== "playing") return;
  const target = actorTarget(game.cat.position, direction, "cat");
  if (!target || !currentVisualPosition) return;
  catVisualOverride = {
    stepCount: game.stepCount,
    from: currentVisualPosition,
    to: target,
    startProgress: progress,
  };
}

function showQueuedTurn(direction) {
  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.classList.toggle("queued-turn", button.dataset.direction === direction);
  });
}

function clearQueuedTurn() {
  queuedTurnRequest = null;
  document.querySelectorAll("[data-direction]").forEach((button) => button.classList.remove("queued-turn"));
}

function syncQueuedTurnAfterStep() {
  catVisualOverride = null;
  if (!queuedTurnRequest || !game) return;
  if (["death", "turn", "level-complete", "game-over"].includes(game.phase)) {
    clearQueuedTurn();
    return;
  }
  if (game.stepCount > queuedTurnRequest.stepCount && game.cat.direction.name === queuedTurnRequest.direction) {
    clearQueuedTurn();
  }
}

function handleJoltDirection(direction) {
  queueDirection(direction);
  const button = document.querySelector(`[data-direction="${direction}"]`);
  if (!button) return;
  button.classList.remove("sensor-hit");
  void button.offsetWidth;
  button.classList.add("sensor-hit");
  window.setTimeout(() => button.classList.remove("sensor-hit"), 180);
}

function handleKey(event) {
  const keys = {
    ArrowUp: "up", w: "up", W: "up", "8": "up",
    ArrowLeft: "left", a: "left", A: "left", "4": "left",
    ArrowDown: "down", s: "down", S: "down", "2": "down",
    ArrowRight: "right", d: "right", D: "right", "6": "right",
  };
  if (keys[event.key]) {
    queueDirection(keys[event.key]);
    event.preventDefault();
    return;
  }
  if (event.key === " " && game) {
    game.useHyperspace();
    catVisualOverride = null;
    event.preventDefault();
  } else if (["Escape", "p", "P"].includes(event.key) && game) {
    game.togglePause();
    event.preventDefault();
  }
}

function frame(now) {
  const delta = Math.min(250, now - lastFrame);
  lastFrame = now;
  if (running && game) {
    accumulator += delta;
    while (accumulator >= game.intervalMs) {
      const snapshot = game.step();
      accumulator -= game.intervalMs;
      syncQueuedTurnAfterStep();
      handleEvents(snapshot.events);
    }
  }
  render();
  requestAnimationFrame(frame);
}

function handleEvents(events) {
  for (const event of events) {
    if (["death", "player-turn", "level-complete", "hyperspace"].includes(event.type)) {
      catVisualOverride = null;
      clearQueuedTurn();
    }
    if (event.type === "game-over" && !highScorePrompted) {
      highScorePrompted = true;
      window.setTimeout(checkHighScore, 450);
    }
  }
}

function checkHighScore() {
  if (!game) return;
  const best = Math.max(...game.players.map((player) => player.score));
  const cutoff = settings.highScores.at(-1)?.score ?? 0;
  if (best <= cutoff && settings.highScores.length >= 5) return;
  document.querySelector("[data-final-score]").textContent = String(best);
  const input = nameDialog.querySelector("input");
  input.value = "";
  openDialog(nameDialog);
  input.focus();
}

function submitHighScore(event) {
  event.preventDefault();
  const input = nameDialog.querySelector("input");
  const name = input.value.trim().slice(0, 9) || "ANON";
  const best = Math.max(...game.players.map((player) => player.score));
  settings.highScores = insertHighScore(settings.highScores, { name, score: best });
  saveSettings();
  closeDialog(nameDialog);
  showHighScores();
}

function showHighScores() {
  const list = scoresDialog.querySelector("ol");
  list.replaceChildren(...settings.highScores.map((entry) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const score = document.createElement("strong");
    name.textContent = entry.name;
    score.textContent = String(entry.score).padStart(6, "0");
    item.append(name, score);
    return item;
  }));
  openDialog(scoresDialog);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const width = Math.max(320, Math.round(rect.width * ratio));
  const height = Math.max(210, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawText(text, x, y, size, color = "#b8ff9f", align = "center") {
  context.fillStyle = color;
  context.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillText(text, Math.round(x), Math.round(y));
}

function render() {
  resizeCanvas();
  const width = canvas.width;
  const height = canvas.height;
  context.fillStyle = "#020503";
  context.fillRect(0, 0, width, height);

  const snapshot = game?.snapshot();
  const motionProgress = currentMotionProgress();
  const sidePadding = Math.max(8, width * 0.018);
  const topPadding = Math.max(8, height * 0.025);
  const cellWidth = Math.floor((width - sidePadding * 2) / MAZE_WIDTH);
  const cellHeight = Math.floor((height - topPadding * 2) / MAZE_HEIGHT);
  const fontSize = Math.max(8, Math.floor(Math.min(cellHeight * 1.06, cellWidth * 1.62)));
  const boardWidth = cellWidth * MAZE_WIDTH;
  const boardHeight = cellHeight * MAZE_HEIGHT;
  const originX = Math.floor((width - boardWidth) / 2);
  const originY = Math.floor((height - boardHeight) / 2);

  for (let y = 0; y < MAZE_HEIGHT; y += 1) {
    for (let x = 0; x < MAZE_WIDTH; x += 1) {
      const source = MAZE_SOURCE[y][x];
      let character = displayTile(source);
      if (snapshot) {
        const tileKey = `${x},${y}`;
        if ((source === "." || source === "J") && !snapshot.pellets.has(tileKey)) character = " ";
        if (source === "o" && !snapshot.energizers.has(tileKey)) character = " ";
      }
      if (character !== " ") {
        const wall = "+-|^v=".includes(character);
        drawText(character, originX + (x + 0.5) * cellWidth, originY + (y + 0.52) * cellHeight, fontSize, wall ? "#7dff72" : "#c9ffb8");
      }
    }
  }

  if (!snapshot) {
    drawText("CATChum MOBILE", width / 2, height * 0.43, Math.max(18, fontSize * 2), "#eaffdf");
    drawText("PRESS START", width / 2, height * 0.58, Math.max(12, fontSize * 1.2));
    updateStatus(null);
    return;
  }

  if (snapshot.fruitVisible) {
    drawEntity("$", snapshot.fruitPosition, "#eaffdf", originX, originY, cellWidth, cellHeight, fontSize);
  }
  for (const ghost of snapshot.ghosts) {
    const character = ghost.eaten ? "@" : ghost.warning ? "M" : ghost.frightened ? "m" : "A";
    drawEntity(character, ghostRenderPosition(ghost.index, motionProgress), ghost.frightened ? "#eaffdf" : "#c9ffb8", originX, originY, cellWidth, cellHeight, fontSize);
  }
  drawEntity(snapshot.cat.mouthOpen ? "C" : "c", catRenderPosition(motionProgress), "#ffffff", originX, originY, cellWidth, cellHeight, fontSize);

  if (snapshot.message) {
    const boxWidth = Math.min(width * 0.68, snapshot.message.length * fontSize * 0.7 + 28);
    const boxHeight = Math.max(fontSize * 2.2, 34);
    context.fillStyle = "rgba(2, 5, 3, .94)";
    context.fillRect((width - boxWidth) / 2, (height - boxHeight) / 2, boxWidth, boxHeight);
    context.strokeStyle = "#7dff72";
    context.lineWidth = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    context.strokeRect((width - boxWidth) / 2, (height - boxHeight) / 2, boxWidth, boxHeight);
    drawText(snapshot.message, width / 2, height / 2, Math.max(10, fontSize * 1.05), "#eaffdf");
  }

  updateStatus(snapshot);
}

function drawEntity(character, position, color, originX, originY, cellWidth, cellHeight, fontSize) {
  for (const visible of wrappedRenderPositions(position, MAZE_WIDTH, MAZE_HEIGHT)) {
    drawText(
      character,
      originX + (visible.x + 0.5) * cellWidth,
      originY + (visible.y + 0.52) * cellHeight,
      fontSize,
      color,
    );
  }
}

function updateStatus(snapshot) {
  const cards = statusPanel.querySelectorAll("[data-player-card]");
  cards.forEach((card, index) => {
    const player = snapshot?.players[index];
    card.hidden = index >= settings.players;
    card.classList.toggle("active", Boolean(player && snapshot.activePlayer === player.number));
    card.querySelector("[data-score]").textContent = String(player?.score ?? 0).padStart(6, "0");
    card.querySelector("[data-cats]").textContent = String(player?.lives ?? 3);
    card.querySelector("[data-hypers]").textContent = String(player?.hypers ?? 3);
    card.querySelector("[data-level]").textContent = String(player?.level ?? 1);
  });
}

function updateOrientationOverlay() {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  rotateOverlay.hidden = !portrait;
  if (portrait && game?.phase === "playing") game.togglePause();
}

document.querySelector("[data-start]").addEventListener("click", startGame);
document.querySelector("[data-open-menu]").addEventListener("click", showMenu);
resumeButton.addEventListener("click", resumeGame);
document.querySelector("[data-open-instructions]").addEventListener("click", () => openDialog(instructionsDialog));
document.querySelector("[data-open-scores]").addEventListener("click", showHighScores);
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
document.querySelector("[data-recalibrate]").addEventListener("click", async () => {
  if (game?.phase === "playing") game.togglePause();
  await tiltController.recalibrate();
});
document.querySelectorAll("[data-direction]").forEach((button) => {
  const send = (event) => { event.preventDefault(); queueDirection(button.dataset.direction); };
  button.addEventListener("pointerdown", send);
  button.addEventListener("click", send);
});
document.querySelector("[data-pause]").addEventListener("click", () => game?.togglePause());
document.querySelector("[data-hyper]").addEventListener("click", () => {
  game?.useHyperspace();
  catVisualOverride = null;
});
playerButtons.forEach((button) => button.addEventListener("click", () => {
  playerButtons.forEach((item) => item.classList.remove("selected"));
  button.classList.add("selected");
}));
difficultyInput.addEventListener("input", () => { difficultyValue.textContent = difficultyInput.value; });
sensitivityInput.addEventListener("input", () => { sensitivityValue.textContent = `${Number(sensitivityInput.value).toFixed(2)}×`; });
sideToggle.addEventListener("change", () => shell.classList.toggle("dpad-left", sideToggle.value === "left"));
nameDialog.querySelector("form").addEventListener("submit", submitHighScore);
window.addEventListener("keydown", handleKey, { passive: false });
window.addEventListener("resize", () => { resizeCanvas(); updateOrientationOverlay(); });
window.addEventListener("orientationchange", updateOrientationOverlay);
document.addEventListener("visibilitychange", () => {
  lastFrame = performance.now();
  if (document.hidden && game?.phase === "playing") game.togglePause();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}

applySettingsToUi();
updateOrientationOverlay();
showMenu();
requestAnimationFrame(frame);
