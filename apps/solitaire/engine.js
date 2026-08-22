export const SUITS = Object.freeze(['clubs', 'diamonds', 'hearts', 'spades']);
export const SUIT_SYMBOLS = Object.freeze({ clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' });
export const RANK_LABELS = Object.freeze({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' });

export const DEFAULT_CONFIG = Object.freeze({
  drawCount: 1,
  recycleLimit: -1,
  undoLimit: -1,
  controlMode: 'drag',
  autoFinish: 'button'
});

const VALID_DRAW_COUNTS = new Set([1, 3]);
const VALID_RECYCLE_LIMITS = new Set([-1, 0, 1, 2, 3]);
const VALID_UNDO_LIMITS = new Set([-1, 0, 1, 3, 5, 10]);
const VALID_CONTROL_MODES = new Set(['drag', 'tap', 'both']);
const VALID_AUTO_FINISH = new Set(['off', 'button', 'automatic']);

export function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  return {
    drawCount: VALID_DRAW_COUNTS.has(Number(merged.drawCount)) ? Number(merged.drawCount) : DEFAULT_CONFIG.drawCount,
    recycleLimit: VALID_RECYCLE_LIMITS.has(Number(merged.recycleLimit)) ? Number(merged.recycleLimit) : DEFAULT_CONFIG.recycleLimit,
    undoLimit: VALID_UNDO_LIMITS.has(Number(merged.undoLimit)) ? Number(merged.undoLimit) : DEFAULT_CONFIG.undoLimit,
    controlMode: VALID_CONTROL_MODES.has(merged.controlMode) ? merged.controlMode : DEFAULT_CONFIG.controlMode,
    autoFinish: VALID_AUTO_FINISH.has(merged.autoFinish) ? merged.autoFinish : DEFAULT_CONFIG.autoFinish
  };
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, faceUp: false });
    }
  }
  return deck;
}

export function shuffledDeck(rng = Math.random) {
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function cardColor(cardOrSuit) {
  const suit = typeof cardOrSuit === 'string' ? cardOrSuit : cardOrSuit.suit;
  return suit === 'diamonds' || suit === 'hearts' ? 'red' : 'black';
}

export function cardLabel(card) {
  return `${RANK_LABELS[card.rank] ?? card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

function cloneCard(card) {
  return { id: card.id, suit: card.suit, rank: card.rank, faceUp: Boolean(card.faceUp) };
}

function cloneCoreState(state) {
  return {
    config: { ...state.config },
    stock: state.stock.map(cloneCard),
    waste: state.waste.map(cloneCard),
    tableau: state.tableau.map((column) => column.map(cloneCard)),
    foundations: Object.fromEntries(SUITS.map((suit) => [suit, state.foundations[suit].map(cloneCard)])),
    score: state.score,
    moves: state.moves,
    recyclesUsed: state.recyclesUsed,
    won: state.won
  };
}

function packCard(card) {
  const suitIndex = SUITS.indexOf(card.suit);
  return (card.faceUp ? 52 : 0) + suitIndex * 13 + (card.rank - 1);
}

function unpackCard(code) {
  if (!Number.isInteger(code) || code < 0 || code > 103) throw new Error('Invalid packed card');
  const faceUp = code >= 52;
  const base = code % 52;
  const suit = SUITS[Math.floor(base / 13)];
  const rank = (base % 13) + 1;
  return { id: `${suit}-${rank}`, suit, rank, faceUp };
}

function packHistorySnapshot(state) {
  return [
    state.stock.map(packCard),
    state.waste.map(packCard),
    state.tableau.map((column) => column.map(packCard)),
    SUITS.map((suit) => state.foundations[suit].map(packCard)),
    state.score,
    state.moves,
    state.recyclesUsed,
    state.won ? 1 : 0
  ];
}

function unpackHistorySnapshot(packed, config) {
  if (!Array.isArray(packed) || packed.length !== 8) throw new Error('Invalid packed snapshot');
  const [stock, waste, tableau, foundations, score, moves, recyclesUsed, won] = packed;
  if (!Array.isArray(stock) || !Array.isArray(waste) || !Array.isArray(tableau) || tableau.length !== 7) throw new Error('Invalid packed piles');
  if (!Array.isArray(foundations) || foundations.length !== SUITS.length || foundations.some((pile) => !Array.isArray(pile))) throw new Error('Invalid packed foundations');
  if (!Number.isFinite(score) || !Number.isInteger(moves) || moves < 0 || !Number.isInteger(recyclesUsed) || recyclesUsed < 0 || (won !== 0 && won !== 1)) throw new Error('Invalid packed counters');

  const restored = {
    config: { ...normalizeConfig(config) },
    stock: stock.map(unpackCard),
    waste: waste.map(unpackCard),
    tableau: tableau.map((column) => column.map(unpackCard)),
    foundations: Object.fromEntries(SUITS.map((suit, index) => [suit, foundations[index].map(unpackCard)])),
    score,
    moves,
    recyclesUsed,
    won: won === 1
  };
  if (!validateState(restored)) throw new Error('Invalid packed state');
  return restored;
}

function snapshot(state) {
  return cloneCoreState(state);
}

function restoreFromSnapshot(state, prior) {
  const restored = cloneCoreState(prior);
  state.config = restored.config;
  state.stock = restored.stock;
  state.waste = restored.waste;
  state.tableau = restored.tableau;
  state.foundations = restored.foundations;
  state.score = restored.score;
  state.moves = restored.moves;
  state.recyclesUsed = restored.recyclesUsed;
  state.won = restored.won;
}

function beginAction(state) {
  if (state.config.undoLimit === 0) return;
  state.history.push(snapshot(state));
  if (state.config.undoLimit > 0) {
    const remaining = Math.max(0, state.config.undoLimit - state.undosUsed);
    if (state.history.length > remaining) state.history.splice(0, state.history.length - remaining);
  }
}

function cancelAction(state) {
  if (state.config.undoLimit !== 0) state.history.pop();
}

function finishAction(state) {
  state.moves += 1;
  state.won = isWon(state);
  return true;
}

function flipExposedTableauCard(state, columnIndex) {
  const column = state.tableau[columnIndex];
  const top = column.at(-1);
  if (top && !top.faceUp) {
    top.faceUp = true;
    state.score += 5;
    return true;
  }
  return false;
}

export function newGame(config = DEFAULT_CONFIG, rng = Math.random) {
  const deck = shuffledDeck(rng);
  const tableau = Array.from({ length: 7 }, () => []);

  for (let column = 0; column < 7; column += 1) {
    for (let row = 0; row <= column; row += 1) {
      const card = deck.pop();
      card.faceUp = row === column;
      tableau[column].push(card);
    }
  }

  for (const card of deck) card.faceUp = false;

  return {
    version: 1,
    config: normalizeConfig(config),
    stock: deck,
    waste: [],
    tableau,
    foundations: Object.fromEntries(SUITS.map((suit) => [suit, []])),
    score: 0,
    moves: 0,
    recyclesUsed: 0,
    undosUsed: 0,
    won: false,
    history: []
  };
}

export function canRecycle(state) {
  if (state.stock.length > 0 || state.waste.length === 0) return false;
  return state.config.recycleLimit < 0 || state.recyclesUsed < state.config.recycleLimit;
}

export function drawStock(state) {
  if (state.won) return false;

  if (state.stock.length > 0) {
    beginAction(state);
    const count = Math.min(state.config.drawCount, state.stock.length);
    for (let i = 0; i < count; i += 1) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    }
    return finishAction(state);
  }

  if (!canRecycle(state)) return false;

  beginAction(state);
  while (state.waste.length > 0) {
    const card = state.waste.pop();
    card.faceUp = false;
    state.stock.push(card);
  }
  state.recyclesUsed += 1;
  return finishAction(state);
}

export function canPlaceOnTableau(card, destinationTop) {
  if (!card) return false;
  if (!destinationTop) return card.rank === 13;
  return destinationTop.faceUp && destinationTop.rank === card.rank + 1 && cardColor(destinationTop) !== cardColor(card);
}

export function canPlaceOnFoundation(card, foundation) {
  if (!card || !card.faceUp) return false;
  if (!foundation || foundation.length === 0) return card.rank === 1;
  const top = foundation.at(-1);
  return top.suit === card.suit && card.rank === top.rank + 1;
}

export function isValidTableauRun(cards) {
  if (!cards.length || cards.some((card) => !card.faceUp)) return false;
  for (let i = 0; i < cards.length - 1; i += 1) {
    const upper = cards[i];
    const lower = cards[i + 1];
    if (upper.rank !== lower.rank + 1 || cardColor(upper) === cardColor(lower)) return false;
  }
  return true;
}

export function movableTableauRun(state, columnIndex, cardIndex) {
  const column = state.tableau[columnIndex];
  if (!column || cardIndex < 0 || cardIndex >= column.length) return null;
  const run = column.slice(cardIndex);
  return isValidTableauRun(run) ? run : null;
}

function removeSourceCards(state, source) {
  if (source.type === 'waste') {
    if (state.waste.length === 0) return null;
    return [state.waste.pop()];
  }

  if (source.type === 'foundation') {
    const pile = state.foundations[source.suit];
    if (!pile || pile.length === 0) return null;
    return [pile.pop()];
  }

  if (source.type === 'tableau') {
    const column = state.tableau[source.column];
    const run = movableTableauRun(state, source.column, source.index);
    if (!column || !run) return null;
    return column.splice(source.index);
  }

  return null;
}

function peekSourceCards(state, source) {
  if (source.type === 'waste') {
    const card = state.waste.at(-1);
    return card ? [card] : null;
  }

  if (source.type === 'foundation') {
    const card = state.foundations[source.suit]?.at(-1);
    return card ? [card] : null;
  }

  if (source.type === 'tableau') {
    return movableTableauRun(state, source.column, source.index);
  }

  return null;
}

export function canMoveToTableau(state, source, destinationColumn) {
  if (state.won || destinationColumn < 0 || destinationColumn > 6) return false;
  if (source.type === 'tableau' && source.column === destinationColumn) return false;
  const moving = peekSourceCards(state, source);
  if (!moving?.length) return false;
  const destination = state.tableau[destinationColumn];
  return canPlaceOnTableau(moving[0], destination.at(-1));
}

export function moveToTableau(state, source, destinationColumn) {
  if (!canMoveToTableau(state, source, destinationColumn)) return false;

  beginAction(state);
  const cards = removeSourceCards(state, source);
  if (!cards) {
    cancelAction(state);
    return false;
  }

  state.tableau[destinationColumn].push(...cards);

  if (source.type === 'waste') state.score += 5;
  if (source.type === 'foundation') state.score -= 15;
  if (source.type === 'tableau') flipExposedTableauCard(state, source.column);

  return finishAction(state);
}

export function canMoveToFoundation(state, source) {
  if (state.won) return false;
  const moving = peekSourceCards(state, source);
  if (!moving || moving.length !== 1) return false;
  const card = moving[0];

  if (source.type === 'tableau') {
    const column = state.tableau[source.column];
    if (!column || source.index !== column.length - 1) return false;
  }

  if (source.type === 'foundation') return false;
  return canPlaceOnFoundation(card, state.foundations[card.suit]);
}

export function moveToFoundation(state, source) {
  if (!canMoveToFoundation(state, source)) return false;

  beginAction(state);
  const cards = removeSourceCards(state, source);
  if (!cards) {
    cancelAction(state);
    return false;
  }

  const card = cards[0];
  state.foundations[card.suit].push(card);
  state.score += 10;
  if (source.type === 'tableau') flipExposedTableauCard(state, source.column);

  return finishAction(state);
}

export function findFoundationMove(state, source) {
  if (!canMoveToFoundation(state, source)) return null;
  const card = peekSourceCards(state, source)[0];
  return { suit: card.suit };
}

export function isWon(state) {
  return SUITS.every((suit) => state.foundations[suit].length === 13);
}

export function canUndo(state) {
  const underLimit = state.config.undoLimit < 0 || state.undosUsed < state.config.undoLimit;
  return underLimit && state.history.length > 0;
}

export function undo(state) {
  if (!canUndo(state)) return false;
  const prior = state.history.pop();
  const history = state.history;
  const undosUsed = state.undosUsed + 1;
  restoreFromSnapshot(state, prior);
  state.history = history;
  state.undosUsed = undosUsed;
  return true;
}

function foundationOnlyCompletionIsForced(state) {
  const foundationRanks = Object.fromEntries(SUITS.map((suit) => [suit, state.foundations[suit].length]));
  const tableauTops = state.tableau.map((column) => column.length - 1);
  let remaining = tableauTops.reduce((sum, index) => sum + index + 1, 0);
  let progressed = true;

  while (remaining > 0 && progressed) {
    progressed = false;
    for (let column = 0; column < tableauTops.length; column += 1) {
      const index = tableauTops[column];
      if (index < 0) continue;
      const card = state.tableau[column][index];
      if (card.rank !== foundationRanks[card.suit] + 1) continue;
      foundationRanks[card.suit] += 1;
      tableauTops[column] -= 1;
      remaining -= 1;
      progressed = true;
    }
  }

  return remaining === 0 && SUITS.every((suit) => foundationRanks[suit] === 13);
}

export function canAutoFinish(state) {
  if (state.won || state.stock.length > 0 || state.waste.length > 0) return false;
  if (!state.tableau.every((column) => column.every((card) => card.faceUp))) return false;
  return foundationOnlyCompletionIsForced(state);
}

function availableFoundationSource(state) {
  for (let column = 0; column < 7; column += 1) {
    const cards = state.tableau[column];
    if (!cards.length) continue;
    const source = { type: 'tableau', column, index: cards.length - 1 };
    if (canMoveToFoundation(state, source)) return source;
  }
  return null;
}

export function autoFinish(state, onStep = null) {
  if (!canAutoFinish(state)) return false;
  let moved = false;
  let safety = 0;

  while (!state.won && safety < 52) {
    safety += 1;
    const source = availableFoundationSource(state);
    if (!source) break;
    moveToFoundation(state, source);
    moved = true;
    if (onStep) onStep(source);
  }

  state.won = isWon(state);
  return moved && state.won;
}

export function serializeGame(state) {
  return JSON.stringify({
    version: 2,
    state: cloneCoreState(state),
    undosUsed: state.undosUsed,
    history: state.history.map(packHistorySnapshot)
  });
}

export function deserializeGame(serialized) {
  let payload;
  try {
    payload = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    if (!payload || (payload.version !== 1 && payload.version !== 2) || !payload.state) return null;

    const config = normalizeConfig(payload.state.config);
    const current = cloneCoreState({ ...payload.state, config });
    if (!validateState(current)) return null;

    let history = [];
    if (Array.isArray(payload.history)) {
      if (payload.version === 2) {
        history = payload.history.map((item) => unpackHistorySnapshot(item, config));
      } else {
        history = payload.history.map((item) => {
          const restored = cloneCoreState({ ...item, config: normalizeConfig(item.config ?? config) });
          if (!validateState(restored)) throw new Error('Invalid legacy history');
          return restored;
        });
      }
    }

    return {
      version: 1,
      ...current,
      undosUsed: Number.isInteger(payload.undosUsed) && payload.undosUsed >= 0 ? payload.undosUsed : 0,
      history
    };
  } catch {
    return null;
  }
}

export function validateState(state) {
  if (!state || !Array.isArray(state.stock) || !Array.isArray(state.waste) || !Array.isArray(state.tableau) || state.tableau.length !== 7) return false;
  if (!state.foundations || !SUITS.every((suit) => Array.isArray(state.foundations[suit]))) return false;

  const allCards = [
    ...state.stock,
    ...state.waste,
    ...state.tableau.flat(),
    ...SUITS.flatMap((suit) => state.foundations[suit])
  ];

  if (allCards.length !== 52) return false;
  const ids = new Set(allCards.map((card) => card.id));
  if (ids.size !== 52) return false;

  for (const card of allCards) {
    if (!SUITS.includes(card.suit) || !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13) return false;
    if (card.id !== `${card.suit}-${card.rank}`) return false;
  }

  for (const suit of SUITS) {
    const pile = state.foundations[suit];
    for (let i = 0; i < pile.length; i += 1) {
      if (pile[i].suit !== suit || pile[i].rank !== i + 1 || !pile[i].faceUp) return false;
    }
  }

  for (const column of state.tableau) {
    let seenFaceUp = false;
    for (const card of column) {
      if (card.faceUp) seenFaceUp = true;
      else if (seenFaceUp) return false;
    }
  }

  if (!state.stock.every((card) => !card.faceUp)) return false;
  if (!state.waste.every((card) => card.faceUp)) return false;
  return true;
}
