import {
  DEFAULT_CONFIG,
  RANK_LABELS,
  SUITS,
  SUIT_SYMBOLS,
  canAutoFinish,
  canMoveToFoundation,
  canMoveToTableau,
  canRecycle,
  canUndo,
  cardColor,
  deserializeGame,
  drawStock,
  moveToFoundation,
  moveToTableau,
  newGame,
  normalizeConfig,
  serializeGame,
  undo
} from './engine.js';

const APP_VERSION = '1.0.4';
const STORAGE = Object.freeze({
  preferences: 'solitaire:v1:preferences',
  session: 'solitaire:v1:session',
  stats: 'solitaire:v1:stats'
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const scoreValue = $('#scoreValue');
const movesValue = $('#movesValue');
const timeValue = $('#timeValue');
const undoButton = $('#undoButton');
const autoFinishButton = $('#autoFinishButton');
const newGameButton = $('#newGameButton');
const menuButton = $('#menuButton');
const stockPile = $('#stockPile');
const wastePile = $('#wastePile');
const tableau = $('#tableau');
const foundationPiles = $$('.foundation-pile');
const tableauColumns = $$('.tableau-column');
const statusMessage = $('#statusMessage');

const settingsDialog = $('#settingsDialog');
const settingsForm = $('#settingsForm');
const settingsTitle = $('#settingsTitle');
const settingsEyebrow = $('#settingsEyebrow');
const settingsNotice = $('#settingsNotice');
const settingsPrimary = $('#settingsPrimary');
const settingsCancel = $('#settingsCancel');
const settingsClose = $('#settingsClose');

const menuDialog = $('#menuDialog');
const statsDialog = $('#statsDialog');
const winDialog = $('#winDialog');

let preferences = loadJson(STORAGE.preferences, DEFAULT_CONFIG);
preferences = normalizeConfig(preferences);
let stats = normalizeStats(loadJson(STORAGE.stats, {}));
let game = null;
let gameGeneration = 0;
let selectedSource = null;
let elapsedBaseMs = 0;
let timerStartedAt = null;
let settingsMode = 'new';
let forceInitialDeal = false;
let autoFinishing = false;
let moveAnimating = false;
let lastTap = { key: '', time: 0 };
let dragState = null;
let activeSnapTarget = null;

$$('[data-version-value]').forEach((element) => { element.textContent = APP_VERSION; });

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private/locked-down contexts; gameplay continues in memory.
  }
}

function normalizeStats(value) {
  return {
    games: Number.isInteger(value?.games) && value.games >= 0 ? value.games : 0,
    wins: Number.isInteger(value?.wins) && value.wins >= 0 ? value.wins : 0,
    bestScore: Number.isFinite(value?.bestScore) ? value.bestScore : null,
    fewestMoves: Number.isInteger(value?.fewestMoves) && value.fewestMoves >= 0 ? value.fewestMoves : null,
    fastestMs: Number.isFinite(value?.fastestMs) && value.fastestMs >= 0 ? value.fastestMs : null
  };
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function elapsedNow() {
  if (timerStartedAt === null) return elapsedBaseMs;
  return elapsedBaseMs + (performance.now() - timerStartedAt);
}

function startTimer() {
  if (!game || game.won || document.hidden || timerStartedAt !== null) return;
  timerStartedAt = performance.now();
}

function pauseTimer() {
  if (timerStartedAt === null) return;
  elapsedBaseMs += performance.now() - timerStartedAt;
  timerStartedAt = null;
}

function saveSession() {
  if (!game || game.won) return;
  try {
    const serializedGame = serializeGame(game);
    localStorage.setItem(STORAGE.session, `{"version":1,"elapsedMs":${elapsedNow()},"game":${serializedGame}}`);
  } catch {
    // Storage can be unavailable or full; gameplay continues in memory.
  }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE.session); } catch { /* no-op */ }
}

function restoreSession() {
  const payload = loadJson(STORAGE.session, null);
  if (!payload || payload.version !== 1) return false;
  const restored = deserializeGame(payload.game);
  if (!restored || restored.won) {
    clearSession();
    return false;
  }
  game = restored;
  gameGeneration += 1;
  elapsedBaseMs = Number.isFinite(payload.elapsedMs) && payload.elapsedMs >= 0 ? payload.elapsedMs : 0;
  timerStartedAt = null;
  return true;
}

function announce(message) {
  statusMessage.textContent = '';
  requestAnimationFrame(() => { statusMessage.textContent = message; });
}

function rankText(rank) {
  return RANK_LABELS[rank] ?? String(rank);
}

function cardAria(card) {
  const rank = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' }[card.rank] ?? card.rank;
  const suit = card.suit[0].toUpperCase() + card.suit.slice(1);
  return `${rank} of ${suit}`;
}

function cardFaceMarkup(card) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const rank = rankText(card.rank);
  return `
    <span class="corner"><span>${rank}</span><span class="suit">${symbol}</span></span>
    <span class="center-suit" aria-hidden="true">${symbol}</span>
    <span class="corner bottom" aria-hidden="true"><span>${rank}</span><span class="suit">${symbol}</span></span>`;
}

function makeCardFace(card, className = 'card') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `${className} ${cardColor(card) === 'red' ? 'red' : ''}`.trim();
  element.setAttribute('aria-label', cardAria(card));
  element.innerHTML = cardFaceMarkup(card);
  return element;
}

function makeStaticCardFace(card, className = 'card') {
  const element = document.createElement('div');
  element.className = `${className} ${cardColor(card) === 'red' ? 'red' : ''}`.trim();
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = cardFaceMarkup(card);
  return element;
}

function makeCardBack() {
  const element = document.createElement('div');
  element.className = 'card back';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function sourceKey(source) {
  if (!source) return '';
  if (source.type === 'tableau') return `t:${source.column}:${source.index}`;
  if (source.type === 'foundation') return `f:${source.suit}`;
  return source.type;
}

function sameSource(a, b) {
  return sourceKey(a) === sourceKey(b);
}

function sourceCards(source) {
  if (!game || !source) return [];
  if (source.type === 'waste') {
    const top = game.waste.at(-1);
    return top ? [top] : [];
  }
  if (source.type === 'foundation') {
    const top = game.foundations[source.suit]?.at(-1);
    return top ? [top] : [];
  }
  if (source.type === 'tableau') return game.tableau[source.column]?.slice(source.index) ?? [];
  return [];
}

function sourceIsMovable(source) {
  if (!game || !source || game.won) return false;
  const cards = sourceCards(source);
  if (!cards.length || cards.some((card) => !card.faceUp)) return false;
  if (source.type !== 'tableau') return cards.length === 1;
  for (let i = 0; i < cards.length - 1; i += 1) {
    const a = cards[i];
    const b = cards[i + 1];
    if (a.rank !== b.rank + 1 || cardColor(a) === cardColor(b)) return false;
  }
  return true;
}

function attachSource(element, source) {
  element.dataset.source = JSON.stringify(source);
  element.addEventListener('pointerdown', onCardPointerDown);
  element.addEventListener('keydown', onSourceKeyDown);
  if (selectedSource && sameSource(selectedSource, source)) element.classList.add('selected');
}

function readSource(element) {
  try { return JSON.parse(element.dataset.source); } catch { return null; }
}

function layoutMetrics() {
  const rect = tableau.getBoundingClientRect();
  const gap = Math.max(3, Math.min(7, window.innerWidth * 0.01));
  const width = Math.max(34, (rect.width - gap * 6) / 7);
  return {
    width,
    height: width * 1.4,
    downGap: Math.max(8, Math.min(13, width * 0.24)),
    upGap: Math.max(17, Math.min(28, width * 0.48))
  };
}

function renderStock() {
  stockPile.replaceChildren();
  stockPile.classList.toggle('empty', game.stock.length === 0);
  stockPile.disabled = game.won || (game.stock.length === 0 && !canRecycle(game));

  if (game.stock.length > 0) {
    stockPile.append(makeCardBack());
    const count = document.createElement('span');
    count.className = 'stock-count';
    count.textContent = String(game.stock.length);
    stockPile.append(count);
    stockPile.setAttribute('aria-label', `Stock, ${game.stock.length} cards. Draw ${game.config.drawCount}.`);
  } else if (canRecycle(game)) {
    stockPile.textContent = '↻';
    const remaining = game.config.recycleLimit < 0 ? 'unlimited redeals' : `${game.config.recycleLimit - game.recyclesUsed} redeals remaining`;
    stockPile.setAttribute('aria-label', `Redeal stock, ${remaining}.`);
  } else {
    stockPile.textContent = '';
    stockPile.setAttribute('aria-label', 'Stock empty');
  }
}

function renderWaste() {
  wastePile.replaceChildren();
  const visibleCount = Math.min(game.config.drawCount, game.waste.length);
  if (visibleCount === 0) {
    wastePile.setAttribute('aria-label', 'Waste empty');
    return;
  }

  const visibleCards = game.waste.slice(-visibleCount);
  const pileWidth = wastePile.getBoundingClientRect().width || layoutMetrics().width;
  const fanGap = game.config.drawCount === 3 ? Math.max(8, Math.min(18, pileWidth * 0.18)) : 0;

  visibleCards.forEach((card, index) => {
    const isTop = index === visibleCards.length - 1;
    const element = isTop ? makeCardFace(card) : makeStaticCardFace(card);
    element.style.transform = `translateX(${index * fanGap}px)`;
    element.style.zIndex = String(index + 1);
    if (isTop) attachSource(element, { type: 'waste' });
    wastePile.append(element);
  });

  wastePile.setAttribute('aria-label', `Waste, ${game.waste.length} cards. Top card ${cardAria(visibleCards.at(-1))}.`);
}

function renderFoundations() {
  for (const pile of foundationPiles) {
    const suit = pile.dataset.foundation;
    $$('.card', pile).forEach((card) => card.remove());
    const top = game.foundations[suit].at(-1);
    if (top) {
      pile.setAttribute('role', 'group');
      pile.removeAttribute('tabindex');
      const element = makeCardFace(top);
      attachSource(element, { type: 'foundation', suit });
      pile.append(element);
    } else {
      pile.setAttribute('role', 'button');
      pile.tabIndex = 0;
    }
    pile.setAttribute('aria-label', `${suit[0].toUpperCase() + suit.slice(1)} foundation, ${game.foundations[suit].length} cards`);
  }
}

function renderTableau() {
  const metrics = layoutMetrics();
  for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
    const columnElement = tableauColumns[columnIndex];
    columnElement.replaceChildren();
    const cards = game.tableau[columnIndex];
    let top = 0;

    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      const element = card.faceUp ? makeCardFace(card) : makeCardBack();
      element.style.setProperty('--card-top', `${top}px`);
      if (card.faceUp) attachSource(element, { type: 'tableau', column: columnIndex, index });
      columnElement.append(element);
      if (index < cards.length - 1) top += card.faceUp ? metrics.upGap : metrics.downGap;
    }

    const requiredHeight = cards.length ? top + metrics.height + 12 : metrics.height + 12;
    columnElement.style.minHeight = `${Math.max(150, requiredHeight)}px`;
    if (cards.length > 0) {
      columnElement.setAttribute('role', 'group');
      columnElement.removeAttribute('tabindex');
    } else {
      columnElement.setAttribute('role', 'button');
      columnElement.tabIndex = 0;
    }
    columnElement.setAttribute('aria-label', `Tableau column ${columnIndex + 1}, ${cards.length} cards`);
  }
}

function renderHud() {
  scoreValue.textContent = game ? String(game.score) : '0';
  movesValue.textContent = game ? String(game.moves) : '0';
  timeValue.textContent = formatTime(game ? elapsedNow() : 0);
  const interactionLocked = autoFinishing || moveAnimating;
  undoButton.disabled = !game || game.won || interactionLocked || !canUndo(game);
  newGameButton.disabled = interactionLocked;
  menuButton.disabled = interactionLocked;
  const showFinish = Boolean(game && !game.won && game.config.autoFinish === 'button' && canAutoFinish(game));
  autoFinishButton.hidden = !showFinish;
  autoFinishButton.disabled = interactionLocked;
}

function render() {
  if (!game) {
    renderHud();
    return;
  }
  renderStock();
  renderWaste();
  renderFoundations();
  renderTableau();
  renderHud();
}

function afterSuccessfulAction(wasWon) {
  selectedSource = null;
  render();
  if (!wasWon && game.won) {
    finishWin();
    return;
  }
  saveSession();
  maybeAutomaticFinish();
}

function performAction(action, message = '') {
  if (!game || autoFinishing || moveAnimating) return false;
  const wasWon = game.won;
  const ok = action();
  if (!ok) return false;
  if (message) announce(message);
  afterSuccessfulAction(wasWon);
  return true;
}

function tryMoveToFoundation(source) {
  const cards = sourceCards(source);
  if (cards.length !== 1 || !canMoveToFoundation(game, source)) return false;
  return performAction(() => moveToFoundation(game, source), `${cardAria(cards[0])} moved to foundation.`);
}

function tryMoveToTableau(source, column) {
  const cards = sourceCards(source);
  if (!cards.length || !canMoveToTableau(game, source, column)) return false;
  return performAction(() => moveToTableau(game, source, column), `${cardAria(cards[0])} moved to tableau column ${column + 1}.`);
}

function handleTapSource(source) {
  if (!sourceIsMovable(source)) return;

  if (selectedSource && !sameSource(selectedSource, source)) {
    if (source.type === 'tableau' && tryMoveToTableau(selectedSource, source.column)) return;
    if (source.type === 'foundation') {
      const moving = sourceCards(selectedSource)[0];
      if (moving?.suit === source.suit && tryMoveToFoundation(selectedSource)) return;
    }
  }

  selectedSource = selectedSource && sameSource(selectedSource, source) ? null : source;
  render();
  if (selectedSource) announce(`${cardAria(sourceCards(source)[0])} selected.`);
}

function handleDestinationTableau(column) {
  if (!selectedSource) return;
  if (!tryMoveToTableau(selectedSource, column)) announce('That move is not allowed.');
}

function handleDestinationFoundation(suit) {
  if (!selectedSource) return;
  const card = sourceCards(selectedSource)[0];
  if (!card || card.suit !== suit || !tryMoveToFoundation(selectedSource)) announce('That move is not allowed.');
}

function onSourceKeyDown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  const source = readSource(event.currentTarget);
  handleTapSource(source);
}

function onCardPointerDown(event) {
  if (!game || game.won || autoFinishing || moveAnimating || event.button > 0) return;
  const source = readSource(event.currentTarget);
  if (!sourceIsMovable(source)) return;

  const allowDrag = game.config.controlMode === 'drag' || game.config.controlMode === 'both';
  dragState = {
    pointerId: event.pointerId,
    source,
    element: event.currentTarget,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    offsetX: event.clientX - event.currentTarget.getBoundingClientRect().left,
    offsetY: event.clientY - event.currentTarget.getBoundingClientRect().top,
    dragging: false,
    allowDrag,
    ghost: null
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function dragSourceElements(state) {
  if (!state?.source) return [];
  if (state.source.type === 'tableau') {
    return $$('.card', tableauColumns[state.source.column]).slice(state.source.index);
  }
  return state.element ? [state.element] : [];
}

function setDragSourceHidden(state, hidden) {
  for (const element of dragSourceElements(state)) {
    element.style.visibility = hidden ? 'hidden' : '';
  }
}

function makeGhost(source) {
  const cards = sourceCards(source);
  const rect = dragState.element.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.setProperty('--ghost-width', `${rect.width}px`);
  const gap = Math.max(16, Math.min(28, rect.width * 0.48));

  cards.forEach((card, index) => {
    const face = makeCardFace(card, 'ghost-card');
    face.tabIndex = -1;
    face.style.top = `${index * gap}px`;
    ghost.append(face);
  });
  document.body.append(ghost);
  return ghost;
}

function positionGhost(x, y) {
  if (!dragState?.ghost) return;
  dragState.ghost.style.left = `${x - dragState.offsetX}px`;
  dragState.ghost.style.top = `${y - dragState.offsetY}px`;
}

function distanceToRect(x, y, rect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

function clearSnapTarget() {
  if (activeSnapTarget?.element) activeSnapTarget.element.classList.remove('snap-target');
  activeSnapTarget = null;
}

function findSnapTarget(source, x, y) {
  if (!game) return null;
  const width = dragState?.element.getBoundingClientRect().width ?? 50;
  const threshold = Math.max(34, width * 0.85);
  const candidates = [];

  tableauColumns.forEach((element, column) => {
    if (!canMoveToTableau(game, source, column)) return;
    candidates.push({ type: 'tableau', column, element, distance: distanceToRect(x, y, element.getBoundingClientRect()) });
  });

  const moving = sourceCards(source);
  if (moving.length === 1 && canMoveToFoundation(game, source)) {
    const suit = moving[0].suit;
    const element = foundationPiles.find((pile) => pile.dataset.foundation === suit);
    if (element) candidates.push({ type: 'foundation', suit, element, distance: distanceToRect(x, y, element.getBoundingClientRect()) });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.distance <= threshold ? candidates[0] : null;
}

function updateSnapTarget(source, x, y) {
  const next = findSnapTarget(source, x, y);
  if (activeSnapTarget?.element === next?.element) return;
  clearSnapTarget();
  activeSnapTarget = next;
  activeSnapTarget?.element.classList.add('snap-target');
}

function reducedMotionPreferred() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function wiggleRejectedCard(element) {
  if (!element || moveAnimating) return;
  moveAnimating = true;
  selectedSource = null;
  element.classList.remove('selected');
  renderHud();
  announce('That card cannot move to a foundation yet.');

  if (!reducedMotionPreferred() && typeof element.animate === 'function') {
    const animation = element.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)', offset: 0.2 },
      { transform: 'translateX(6px)', offset: 0.4 },
      { transform: 'translateX(-4px)', offset: 0.6 },
      { transform: 'translateX(4px)', offset: 0.8 },
      { transform: 'translateX(0)' }
    ], { duration: 260, easing: 'ease-out' });
    try { await animation.finished; } catch { /* animation cancelled */ }
  }

  moveAnimating = false;
  render();
}

async function flyDoubleTapCardToFoundation(source, element) {
  if (!game || !element || moveAnimating || autoFinishing) return;
  const cards = sourceCards(source);
  const card = cards.length === 1 ? cards[0] : null;
  if (!card || !canMoveToFoundation(game, source)) {
    await wiggleRejectedCard(element);
    return;
  }

  const foundation = foundationPiles.find((pile) => pile.dataset.foundation === card.suit);
  if (!foundation) {
    await wiggleRejectedCard(element);
    return;
  }

  const targetGame = game;
  const generation = gameGeneration;
  const wasWon = targetGame.won;
  const start = element.getBoundingClientRect();
  const destination = foundation.getBoundingClientRect();
  const dx = destination.left + (destination.width - start.width) / 2 - start.left;
  const dy = destination.top + (destination.height - start.height) / 2 - start.top;

  moveAnimating = true;
  selectedSource = null;
  element.classList.remove('selected');
  renderHud();

  const flight = element.cloneNode(true);
  flight.classList.remove('selected');
  flight.removeAttribute('data-source');
  flight.tabIndex = -1;
  flight.setAttribute('aria-hidden', 'true');
  if ('disabled' in flight) flight.disabled = true;
  Object.assign(flight.style, {
    position: 'fixed',
    inset: 'auto',
    left: `${start.left}px`,
    top: `${start.top}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
    margin: '0',
    zIndex: '2200',
    pointerEvents: 'none',
    transformOrigin: 'center center',
    willChange: 'transform'
  });
  document.body.append(flight);
  element.style.visibility = 'hidden';

  if (!reducedMotionPreferred() && typeof flight.animate === 'function') {
    const animation = flight.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)', offset: 0 },
      { transform: `translate3d(${dx * 0.55}px, ${dy * 0.55 - 18}px, 0) scale(.98)`, offset: 0.55 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(.96)`, offset: 1 }
    ], { duration: 340, easing: 'cubic-bezier(.22,.78,.25,1)', fill: 'forwards' });
    try { await animation.finished; } catch { /* animation cancelled */ }
  }

  const stillCurrent = game === targetGame && gameGeneration === generation;
  if (!stillCurrent) {
    flight.remove();
    element.style.visibility = '';
    moveAnimating = false;
    render();
    return;
  }

  const moved = moveToFoundation(targetGame, source);
  flight.remove();
  moveAnimating = false;

  if (moved) {
    announce(`${cardAria(card)} moved to foundation.`);
    afterSuccessfulAction(wasWon);
  } else {
    element.style.visibility = '';
    render();
  }
}

async function handleDoubleTapFeedback(source, element) {
  if (!game || moveAnimating || autoFinishing) return;
  const cards = sourceCards(source);
  if (cards.length === 1 && canMoveToFoundation(game, source)) {
    await flyDoubleTapCardToFoundation(source, element);
  } else {
    await wiggleRejectedCard(element);
  }
}

window.addEventListener('pointermove', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);

  if (!dragState.dragging && dragState.allowDrag && distance >= 6) {
    dragState.dragging = true;
    dragState.ghost = makeGhost(dragState.source);
    setDragSourceHidden(dragState, true);
  }

  if (dragState.dragging) {
    event.preventDefault();
    positionGhost(event.clientX, event.clientY);
    updateSnapTarget(dragState.source, event.clientX, event.clientY);
  }
}, { passive: false });

window.addEventListener('pointerup', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const current = dragState;

  if (current.dragging) {
    const target = findSnapTarget(current.source, event.clientX, event.clientY);
    current.ghost?.remove();
    setDragSourceHidden(current, false);
    clearSnapTarget();
    dragState = null;

    if (target?.type === 'tableau') tryMoveToTableau(current.source, target.column);
    else if (target?.type === 'foundation') tryMoveToFoundation(current.source);
    else render();
    return;
  }

  dragState = null;
  const now = performance.now();
  const key = sourceKey(current.source);
  const isDoubleTap = lastTap.key === key && now - lastTap.time <= 330;
  lastTap = { key, time: now };

  if (isDoubleTap) {
    lastTap = { key: '', time: 0 };
    void handleDoubleTapFeedback(current.source, current.element);
    return;
  }

  if (game.config.controlMode === 'tap' || game.config.controlMode === 'both') handleTapSource(current.source);
});

window.addEventListener('pointercancel', () => {
  if (!dragState) return;
  const current = dragState;
  current.ghost?.remove();
  setDragSourceHidden(current, false);
  dragState = null;
  clearSnapTarget();
  render();
});

stockPile.addEventListener('click', () => {
  if (!game || autoFinishing || moveAnimating) return;
  const recycling = game.stock.length === 0;
  const count = Math.min(game.config.drawCount, game.stock.length);
  performAction(() => drawStock(game), recycling ? 'Stock redealt.' : `Drew ${count} card${count === 1 ? '' : 's'}.`);
});

tableauColumns.forEach((column) => {
  column.addEventListener('pointerup', (event) => {
    if (event.target.closest('.card') || !selectedSource) return;
    handleDestinationTableau(Number(column.dataset.column));
  });
  column.addEventListener('keydown', (event) => {
    if (event.target !== column) return;
    if ((event.key === 'Enter' || event.key === ' ') && selectedSource) {
      event.preventDefault();
      handleDestinationTableau(Number(column.dataset.column));
    }
  });
});

foundationPiles.forEach((pile) => {
  pile.addEventListener('pointerup', (event) => {
    if (event.target.closest('.card') || !selectedSource) return;
    handleDestinationFoundation(pile.dataset.foundation);
  });
  pile.addEventListener('keydown', (event) => {
    if (event.target !== pile) return;
    if ((event.key === 'Enter' || event.key === ' ') && selectedSource) {
      event.preventDefault();
      handleDestinationFoundation(pile.dataset.foundation);
    }
  });
});

undoButton.addEventListener('click', () => {
  if (!game || autoFinishing || moveAnimating) return;
  if (performAction(() => undo(game), 'Move undone.')) saveSession();
});

autoFinishButton.addEventListener('click', () => runAutoFinish());

async function runAutoFinish() {
  const targetGame = game;
  const generation = gameGeneration;
  if (!targetGame || targetGame.won || autoFinishing || moveAnimating || !canAutoFinish(targetGame)) return;
  const isCurrent = () => game === targetGame && gameGeneration === generation;

  autoFinishing = true;
  selectedSource = null;
  renderHud();

  let safety = 0;
  while (isCurrent() && !targetGame.won && safety < 52) {
    safety += 1;
    let source = null;
    for (let column = 0; column < 7; column += 1) {
      const cards = targetGame.tableau[column];
      if (!cards.length) continue;
      const candidate = { type: 'tableau', column, index: cards.length - 1 };
      if (canMoveToFoundation(targetGame, candidate)) {
        source = candidate;
        break;
      }
    }
    if (!source) break;
    moveToFoundation(targetGame, source);
    if (!isCurrent()) return;
    render();
    await delay(85);
  }

  if (!isCurrent()) return;
  autoFinishing = false;
  render();
  if (targetGame.won) finishWin();
  else saveSession();
}

function maybeAutomaticFinish() {
  if (!game || autoFinishing || moveAnimating || game.won) return;
  if (game.config.autoFinish === 'automatic' && canAutoFinish(game)) {
    window.setTimeout(() => runAutoFinish(), 180);
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setSettingsForm(config) {
  const normalized = normalizeConfig(config);
  const draw = settingsForm.elements.namedItem('drawCount');
  for (const radio of draw) radio.checked = Number(radio.value) === normalized.drawCount;
  settingsForm.elements.recycleLimit.value = String(normalized.recycleLimit);
  settingsForm.elements.undoLimit.value = String(normalized.undoLimit);
  const controls = settingsForm.elements.namedItem('controlMode');
  for (const radio of controls) radio.checked = radio.value === normalized.controlMode;
  settingsForm.elements.autoFinish.value = normalized.autoFinish;
}

function readSettingsForm() {
  const data = new FormData(settingsForm);
  return normalizeConfig({
    drawCount: Number(data.get('drawCount')),
    recycleLimit: Number(data.get('recycleLimit')),
    undoLimit: Number(data.get('undoLimit')),
    controlMode: data.get('controlMode'),
    autoFinish: data.get('autoFinish')
  });
}

function openSettings(mode = 'new', force = false) {
  settingsMode = mode;
  forceInitialDeal = force;
  setSettingsForm(preferences);
  const isNew = mode === 'new';
  settingsEyebrow.textContent = isNew ? 'New deal' : 'Preferences';
  settingsTitle.textContent = isNew ? 'New Game' : 'Settings for Next Game';
  settingsPrimary.textContent = isNew ? 'Deal' : 'Save';
  settingsNotice.hidden = isNew || !game;
  settingsCancel.hidden = force;
  settingsClose.hidden = force;
  settingsDialog.showModal();
}

function requestNewGame() {
  if (autoFinishing || moveAnimating) return;
  if (game && !game.won && game.moves > 0) {
    const abandon = window.confirm('Abandon the current game and start a new deal?');
    if (!abandon) return;
  }
  closeDialog(menuDialog);
  closeDialog(winDialog);
  openSettings('new', false);
}

function secureRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] / 0x100000000;
  }
  return Math.random();
}

function startNewGame(config) {
  pauseTimer();
  preferences = normalizeConfig(config);
  saveJson(STORAGE.preferences, preferences);
  gameGeneration += 1;
  game = newGame(preferences, secureRandom);
  selectedSource = null;
  elapsedBaseMs = 0;
  timerStartedAt = null;
  autoFinishing = false;
  stats.games += 1;
  saveJson(STORAGE.stats, stats);
  clearSession();
  render();
  startTimer();
  saveSession();
  announce(`New ${game.config.drawCount === 1 ? 'draw-one' : 'draw-three'} game dealt.`);
}

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const next = readSettingsForm();
  preferences = next;
  saveJson(STORAGE.preferences, preferences);
  closeDialog(settingsDialog);
  if (settingsMode === 'new') startNewGame(next);
  else announce('Settings saved for the next game.');
});

settingsCancel.addEventListener('click', () => {
  if (!forceInitialDeal) closeDialog(settingsDialog);
});
settingsClose.addEventListener('click', () => {
  if (!forceInitialDeal) closeDialog(settingsDialog);
});
settingsDialog.addEventListener('cancel', (event) => {
  if (forceInitialDeal) event.preventDefault();
});

newGameButton.addEventListener('click', requestNewGame);
menuButton.addEventListener('click', () => menuDialog.showModal());
$('#menuClose').addEventListener('click', () => closeDialog(menuDialog));
$('#menuNewGame').addEventListener('click', requestNewGame);
$('#menuSettings').addEventListener('click', () => {
  closeDialog(menuDialog);
  openSettings('settings');
});
$('#menuStats').addEventListener('click', () => {
  closeDialog(menuDialog);
  showStats();
});

function showStats() {
  $('#statsGames').textContent = String(stats.games);
  $('#statsWins').textContent = String(stats.wins);
  $('#statsRate').textContent = stats.games ? `${Math.round((stats.wins / stats.games) * 100)}%` : '0%';
  $('#statsScore').textContent = stats.bestScore === null ? '—' : String(stats.bestScore);
  $('#statsMoves').textContent = stats.fewestMoves === null ? '—' : String(stats.fewestMoves);
  $('#statsTime').textContent = stats.fastestMs === null ? '—' : formatTime(stats.fastestMs);
  statsDialog.showModal();
}

$('#statsClose').addEventListener('click', () => closeDialog(statsDialog));
$('#statsDone').addEventListener('click', () => closeDialog(statsDialog));
$('#winNewGame').addEventListener('click', () => {
  closeDialog(winDialog);
  openSettings('new');
});

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function finishWin() {
  pauseTimer();
  clearSession();
  const elapsed = elapsedNow();
  stats.wins += 1;
  stats.bestScore = stats.bestScore === null ? game.score : Math.max(stats.bestScore, game.score);
  stats.fewestMoves = stats.fewestMoves === null ? game.moves : Math.min(stats.fewestMoves, game.moves);
  stats.fastestMs = stats.fastestMs === null ? elapsed : Math.min(stats.fastestMs, elapsed);
  saveJson(STORAGE.stats, stats);

  $('#winScore').textContent = String(game.score);
  $('#winMoves').textContent = String(game.moves);
  $('#winTime').textContent = formatTime(elapsed);
  renderHud();
  celebrate();
  window.setTimeout(() => {
    if (!winDialog.open) winDialog.showModal();
  }, 700);
  announce('Game complete. You won.');
}

function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'celebration-layer';
  const labels = ['A♠', 'K♥', 'Q♣', 'J♦', '10♠', '9♥', '8♣', '7♦'];
  for (let i = 0; i < 24; i += 1) {
    const element = document.createElement('div');
    const label = labels[i % labels.length];
    element.className = `celebration-card ${label.includes('♥') || label.includes('♦') ? 'red' : ''}`;
    element.textContent = label;
    element.style.left = `${4 + ((i * 37) % 92)}%`;
    element.style.setProperty('--delay', `${(i % 8) * 55}ms`);
    element.style.setProperty('--duration', `${1100 + (i % 5) * 130}ms`);
    element.style.setProperty('--drift', `${((i % 7) - 3) * 18}px`);
    element.style.setProperty('--spin', `${((i % 2 ? 1 : -1) * (180 + (i % 5) * 55))}deg`);
    layer.append(element);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 2300);
}

window.addEventListener('resize', () => {
  if (game && !dragState) renderTableau();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseTimer();
    saveSession();
  } else {
    startTimer();
  }
  renderHud();
});

window.addEventListener('beforeunload', () => {
  pauseTimer();
  saveSession();
});

setInterval(() => {
  if (!document.hidden && game && !game.won) renderHud();
}, 1000);

setInterval(() => {
  if (!document.hidden && game && !game.won) saveSession();
}, 15000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

if (restoreSession()) {
  render();
  startTimer();
  announce('Unfinished game restored.');
} else {
  renderHud();
  openSettings('new', true);
}
