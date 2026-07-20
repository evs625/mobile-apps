export const DIRECTIONS = Object.freeze({
  UP: Object.freeze({ name: "up", dx: 0, dy: -1 }),
  LEFT: Object.freeze({ name: "left", dx: -1, dy: 0 }),
  DOWN: Object.freeze({ name: "down", dx: 0, dy: 1 }),
  RIGHT: Object.freeze({ name: "right", dx: 1, dy: 0 }),
});

export const DIRECTION_ORDER = Object.freeze([
  DIRECTIONS.UP,
  DIRECTIONS.LEFT,
  DIRECTIONS.DOWN,
  DIRECTIONS.RIGHT,
]);

export const MAZE_SOURCE = Object.freeze([
  "+-------------------+/^/+/^/+-------------------+",
  "|/. . . . . J . . . . J/|/J . . . . J . . . . ./|",
  "|/./+-----+/./+-----+/./|/./+-----+/./+-----+/./|",
  "|/o/|/////|/./|/////|/./|/./|/////|/./|/////|/o/|",
  "|/./+-----+/./+-----+/./|/./+-----+/./+-----+/./|",
  "|/J . . . . J . J . . ./|/. . . J . J . . . . J/|",
  "|/./-------/./|/./------+------/./|/./-------/./|",
  "|/. . . . . J/|/. . . ./|/. . . ./|/J . . . . ./|",
  "+---------+/./+------/ /|/ /------+/./+---------+",
  "//////////|/./|/      j   j      /|/./|//////////",
  "----------+/./|/ /+-----=-----+/ /|/./+----------",
  "<           J   j/|///////////|/j   J           >",
  "----------+/./|/ /+-----=-----+/ /|/./+----------",
  "//////////|/./|/j               j/|/./|//////////",
  "+---------+/./|/ /------+------/ /|/./+---------+",
  "|/. . . . . J . J . . ./|/. . . J . J . . . . ./|",
  "|/./------+/./-------/./|/./-------/./+------/./|",
  "|/o . . ./|/J . J . . J   J . . J . J/|/. . . o/|",
  "+------/./|/./|/./-------------/./|/./|/./------+",
  "|/. . . J . ./|/. . . J . J . . ./|/. . J . . ./|",
  "|/./----------+------/./|/./------+----------/./|",
  "|/. . . . . . . . . . J/|/J . . . . . . . . . ./|",
  "+-------------------+/v/+/v/+-------------------+",
]);

export const MAZE_WIDTH = 49;
export const MAZE_HEIGHT = 23;

const WALLS = new Set(["+", "-", "|", "^", "v"]);
const CAT_START = Object.freeze({ x: 24, y: 17 });
const GHOST_HOME = Object.freeze({ x: 24, y: 11 });
const GHOST_EXIT = Object.freeze({ x: 24, y: 9 });
const FRUIT_POSITION = Object.freeze({ x: 24, y: 17 });
const CORNERS = Object.freeze([
  Object.freeze({ x: 46, y: 1 }),
  Object.freeze({ x: 2, y: 1 }),
  Object.freeze({ x: 46, y: 21 }),
  Object.freeze({ x: 2, y: 21 }),
]);
const MODE_SCHEDULE_MS = Object.freeze([
  ["scatter", 7_000], ["chase", 20_000],
  ["scatter", 7_000], ["chase", 20_000],
  ["scatter", 5_000], ["chase", 20_000],
  ["scatter", 5_000], ["chase", Number.POSITIVE_INFINITY],
]);
const DIFFICULTY_INTERVALS = Object.freeze([180, 165, 151, 139, 128, 117, 107, 98, 90]);
const FRUIT_POINTS = Object.freeze([100, 300, 500, 700, 1_000, 2_000, 3_000, 5_000]);
const DEATH_MESSAGES = Object.freeze(["SORRY SUCKER!", "NICE TRY, PAL!", "YOU'RE OUT OF HERE, DADDY!"]);

function key(x, y) {
  return `${x},${y}`;
}

function clonePosition(position) {
  return { x: position.x, y: position.y };
}

function sameDirection(a, b) {
  return Boolean(a && b && a.name === b.name);
}

export function opposite(direction) {
  return DIRECTION_ORDER.find((candidate) => candidate.dx === -direction.dx && candidate.dy === -direction.dy);
}

export function parseMaze(source = MAZE_SOURCE) {
  if (source.length !== MAZE_HEIGHT || source.some((row) => row.length !== MAZE_WIDTH)) {
    throw new Error(`CatChum maze must be ${MAZE_WIDTH}×${MAZE_HEIGHT}.`);
  }

  const tiles = source.map((row) => [...row]);
  const pellets = new Set();
  const energizers = new Set();

  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      const tile = tiles[y][x];
      if (tile === "." || tile === "J") pellets.add(key(x, y));
      if (tile === "o") energizers.add(key(x, y));
    }
  }

  return { tiles, pellets, energizers };
}

export function displayTile(tile) {
  if (tile === "/" || tile === "j") return " ";
  if (tile === "J") return ".";
  return tile;
}

export function isPassableTile(tile, actor = "cat") {
  if (WALLS.has(tile)) return false;
  if (tile === "=" && actor === "cat") return false;
  return true;
}

export function movePosition(position, direction) {
  let x = position.x + direction.dx;
  const y = position.y + direction.dy;
  if (position.y === 11 && x < 0) x = MAZE_WIDTH - 1;
  if (position.y === 11 && x >= MAZE_WIDTH) x = 0;
  return { x, y };
}

export function availableDirections(tiles, position, actor = "cat") {
  return DIRECTION_ORDER.filter((direction) => {
    const next = movePosition(position, direction);
    if (next.y < 0 || next.y >= MAZE_HEIGHT || next.x < 0 || next.x >= MAZE_WIDTH) return false;
    return isPassableTile(tiles[next.y][next.x], actor);
  });
}

function targetDistance(position, target) {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  return dx * dx + dy * dy;
}

export function chooseTargetDirection(tiles, position, currentDirection, target, actor = "ghost") {
  const legal = availableDirections(tiles, position, actor);
  if (!legal.length) return currentDirection;
  const reverse = currentDirection ? opposite(currentDirection) : null;
  const candidates = legal.filter((direction) => !sameDirection(direction, reverse));
  const pool = candidates.length ? candidates : legal;

  return pool.reduce((best, direction) => {
    if (!best) return direction;
    const bestPosition = movePosition(position, best);
    const nextPosition = movePosition(position, direction);
    return targetDistance(nextPosition, target) < targetDistance(bestPosition, target) ? direction : best;
  }, null);
}

export function createSeededRandom(seed = 0x43_41_54) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function cloneSet(set) {
  return new Set(set);
}

function createPlayer(number, parsedMaze) {
  return {
    number,
    score: 0,
    lives: 3,
    level: 1,
    hypers: 3,
    nextExtraScore: 10_000,
    pellets: cloneSet(parsedMaze.pellets),
    energizers: cloneSet(parsedMaze.energizers),
    eaten: 0,
    fruitStage: 0,
    fruitVisibleUntil: 0,
    gameOver: false,
  };
}

function createGhost(index) {
  const starts = [
    { x: 24, y: 9 },
    { x: 22, y: 11 },
    { x: 24, y: 11 },
    { x: 26, y: 11 },
  ];
  return {
    index,
    position: clonePosition(starts[index]),
    direction: index === 0 ? DIRECTIONS.LEFT : DIRECTIONS.UP,
    released: index === 0,
    eaten: false,
  };
}

export function difficultyInterval(difficulty) {
  const safe = Math.max(1, Math.min(9, Math.trunc(difficulty || 1)));
  return DIFFICULTY_INTERVALS[safe - 1];
}

export class CatChumGame {
  constructor({ players = 1, difficulty = 1, random = createSeededRandom() } = {}) {
    this.parsedMaze = parseMaze();
    this.tiles = this.parsedMaze.tiles;
    this.playerCount = players === 2 ? 2 : 1;
    this.difficulty = Math.max(1, Math.min(9, Math.trunc(difficulty || 1)));
    this.random = random;
    this.players = Array.from({ length: this.playerCount }, (_, index) => createPlayer(index + 1, this.parsedMaze));
    this.activePlayerIndex = 0;
    this.timeMs = 0;
    this.levelTimeMs = 0;
    this.modeIndex = 0;
    this.modeElapsedMs = 0;
    this.mode = MODE_SCHEDULE_MS[0][0];
    this.frightenedUntil = 0;
    this.frightenedChain = 0;
    this.phase = "ready";
    this.phaseTicks = 12;
    this.message = "GET SET!";
    this.messageTicks = 12;
    this.stepCount = 0;
    this.events = [];
    this.cat = { position: clonePosition(CAT_START), direction: DIRECTIONS.LEFT, queuedDirection: DIRECTIONS.LEFT };
    this.ghosts = Array.from({ length: 4 }, (_, index) => createGhost(index));
  }

  get activePlayer() {
    return this.players[this.activePlayerIndex];
  }

  get intervalMs() {
    return difficultyInterval(this.difficulty);
  }

  queueDirection(directionName) {
    const direction = DIRECTION_ORDER.find((candidate) => candidate.name === directionName);
    if (direction) this.cat.queuedDirection = direction;
  }

  togglePause() {
    if (this.phase === "playing") {
      this.phase = "paused";
      this.message = "PAUSED";
      this.messageTicks = Number.POSITIVE_INFINITY;
    } else if (this.phase === "paused") {
      this.phase = "playing";
      this.message = "";
      this.messageTicks = 0;
    }
  }

  useHyperspace() {
    if (this.phase !== "playing") return false;
    const player = this.activePlayer;
    if (player.hypers <= 0) {
      this.showMessage("NO HYPERSPACE FUEL!!", 12);
      return false;
    }

    const safeTiles = [];
    for (let y = 0; y < MAZE_HEIGHT; y += 1) {
      for (let x = 0; x < MAZE_WIDTH; x += 1) {
        if (!isPassableTile(this.tiles[y][x], "cat")) continue;
        const minGhostDistance = Math.min(...this.ghosts.map((ghost) => targetDistance({ x, y }, ghost.position)));
        if (minGhostDistance >= 36) safeTiles.push({ x, y });
      }
    }
    const pool = safeTiles.length ? safeTiles : [clonePosition(CAT_START)];
    this.cat.position = clonePosition(pool[Math.floor(this.random() * pool.length)]);
    player.hypers -= 1;
    this.showMessage("SHECKY, GET THE JET!", 8);
    this.events.push({ type: "hyperspace", player: player.number });
    return true;
  }

  step() {
    this.events = [];
    this.stepCount += 1;
    this.timeMs += this.intervalMs;

    if (this.messageTicks > 0 && Number.isFinite(this.messageTicks)) {
      this.messageTicks -= 1;
      if (this.messageTicks <= 0) this.message = "";
    }

    if (["paused", "game-over"].includes(this.phase)) return this.snapshot();

    if (this.phase !== "playing") {
      this.phaseTicks -= 1;
      if (this.phaseTicks <= 0) this.finishPhase();
      return this.snapshot();
    }

    this.levelTimeMs += this.intervalMs;
    this.advanceMode();
    this.releaseGhosts();
    this.moveCat();
    this.consumeCurrentTile();
    this.resolveCollisions();
    if (this.phase === "playing") this.moveGhosts();
    this.resolveCollisions();
    this.updateFruit();
    this.checkLevelComplete();
    return this.snapshot();
  }

  finishPhase() {
    if (this.phase === "ready" || this.phase === "turn") {
      this.phase = "playing";
      this.message = "";
      this.messageTicks = 0;
      return;
    }
    if (this.phase === "death") {
      this.advanceAfterDeath();
      return;
    }
    if (this.phase === "level-complete") {
      this.startNextLevel();
    }
  }

  advanceMode() {
    if (this.timeMs < this.frightenedUntil) return;
    this.modeElapsedMs += this.intervalMs;
    const duration = MODE_SCHEDULE_MS[this.modeIndex][1];
    if (this.modeElapsedMs < duration) return;
    this.modeElapsedMs = 0;
    this.modeIndex = Math.min(this.modeIndex + 1, MODE_SCHEDULE_MS.length - 1);
    const nextMode = MODE_SCHEDULE_MS[this.modeIndex][0];
    if (nextMode !== this.mode) {
      this.mode = nextMode;
      for (const ghost of this.ghosts) ghost.direction = opposite(ghost.direction);
    }
  }

  releaseGhosts() {
    const thresholds = [0, 15, 40, 75];
    this.ghosts.forEach((ghost, index) => {
      if (ghost.released) return;
      if (this.activePlayer.eaten >= thresholds[index] || this.levelTimeMs >= 4_000 + index * 3_500) {
        ghost.released = true;
        ghost.position = clonePosition(GHOST_EXIT);
        ghost.direction = DIRECTIONS.LEFT;
      }
    });
  }

  moveCat() {
    const queuedNext = movePosition(this.cat.position, this.cat.queuedDirection);
    if (this.canEnter(queuedNext, "cat")) this.cat.direction = this.cat.queuedDirection;
    const next = movePosition(this.cat.position, this.cat.direction);
    if (this.canEnter(next, "cat")) this.cat.position = next;
  }

  consumeCurrentTile() {
    const player = this.activePlayer;
    const currentKey = key(this.cat.position.x, this.cat.position.y);
    if (player.pellets.delete(currentKey)) {
      player.eaten += 1;
      this.addScore(10);
    }
    if (player.energizers.delete(currentKey)) {
      player.eaten += 1;
      this.addScore(50);
      this.frightenedChain = 0;
      const duration = Math.max(2_500, 8_000 - (this.difficulty - 1) * 350 - (player.level - 1) * 200);
      this.frightenedUntil = this.timeMs + duration;
      for (const ghost of this.ghosts) ghost.direction = opposite(ghost.direction);
      this.showMessage("THANK YOU!", 7);
      this.events.push({ type: "energizer" });
    }
    if (player.fruitVisibleUntil > this.timeMs && this.cat.position.x === FRUIT_POSITION.x && this.cat.position.y === FRUIT_POSITION.y) {
      const points = FRUIT_POINTS[Math.min(player.level - 1, FRUIT_POINTS.length - 1)];
      player.fruitVisibleUntil = 0;
      this.addScore(points);
      this.showMessage(`${points} BONUS!`, 9);
      this.events.push({ type: "fruit", points });
    }
  }

  moveGhosts() {
    const frightened = this.timeMs < this.frightenedUntil;
    for (const ghost of this.ghosts) {
      if (!ghost.released) continue;
      if (frightened && this.stepCount % 2 === 0 && !ghost.eaten) continue;

      if (ghost.eaten && ghost.position.x === GHOST_HOME.x && ghost.position.y === GHOST_HOME.y) {
        ghost.eaten = false;
        ghost.released = true;
        ghost.position = clonePosition(GHOST_EXIT);
      }

      const legal = availableDirections(this.tiles, ghost.position, "ghost");
      if (!legal.length) continue;
      const reverse = opposite(ghost.direction);
      const nonReverse = legal.filter((direction) => !sameDirection(direction, reverse));
      const pool = nonReverse.length ? nonReverse : legal;

      if (frightened && !ghost.eaten) {
        ghost.direction = pool[Math.floor(this.random() * pool.length)];
      } else {
        const target = ghost.eaten ? GHOST_HOME : this.ghostTarget(ghost);
        ghost.direction = chooseTargetDirection(this.tiles, ghost.position, ghost.direction, target, "ghost");
      }
      ghost.position = movePosition(ghost.position, ghost.direction);
    }
  }

  ghostTarget(ghost) {
    if (this.mode === "scatter") return CORNERS[ghost.index];
    const cat = this.cat.position;
    const ahead = (distance) => ({
      x: cat.x + this.cat.direction.dx * distance,
      y: cat.y + this.cat.direction.dy * distance,
    });

    if (ghost.index === 0) return cat;
    if (ghost.index === 1) return ahead(4);
    if (ghost.index === 2) {
      const pivot = ahead(2);
      const chaser = this.ghosts[0].position;
      return { x: pivot.x * 2 - chaser.x, y: pivot.y * 2 - chaser.y };
    }
    return targetDistance(ghost.position, cat) > 64 ? cat : CORNERS[ghost.index];
  }

  resolveCollisions() {
    if (this.phase !== "playing") return;
    const frightened = this.timeMs < this.frightenedUntil;
    for (const ghost of this.ghosts) {
      if (ghost.position.x !== this.cat.position.x || ghost.position.y !== this.cat.position.y) continue;
      if (ghost.eaten) continue;
      if (frightened) {
        ghost.eaten = true;
        this.frightenedChain += 1;
        const points = 200 * (2 ** (this.frightenedChain - 1));
        this.addScore(points);
        this.showMessage(`${points}`, 5);
        this.events.push({ type: "ghost-eaten", points, ghost: ghost.index });
      } else {
        this.killCat();
        break;
      }
    }
  }

  killCat() {
    const player = this.activePlayer;
    player.lives -= 1;
    if (player.lives <= 0) player.gameOver = true;
    const message = DEATH_MESSAGES[Math.floor(this.random() * DEATH_MESSAGES.length)];
    this.phase = "death";
    this.phaseTicks = 13;
    this.showMessage(message, 13);
    this.events.push({ type: "death", player: player.number, gameOver: player.gameOver });
  }

  advanceAfterDeath() {
    const living = this.players.map((player, index) => ({ player, index })).filter(({ player }) => !player.gameOver);
    if (!living.length) {
      this.phase = "game-over";
      this.message = "GAME OVER";
      this.messageTicks = Number.POSITIVE_INFINITY;
      this.events.push({ type: "game-over" });
      return;
    }

    if (this.playerCount === 2) {
      const otherIndex = (this.activePlayerIndex + 1) % 2;
      if (!this.players[otherIndex].gameOver) this.activePlayerIndex = otherIndex;
    }
    this.resetActors();
    this.phase = "turn";
    this.phaseTicks = 10;
    this.showMessage(`PLAYER ${this.activePlayer.number} - GET SET!`, 10);
    this.events.push({ type: "player-turn", player: this.activePlayer.number });
  }

  updateFruit() {
    const player = this.activePlayer;
    const total = this.parsedMaze.pellets.size + this.parsedMaze.energizers.size;
    const thresholds = [Math.min(70, Math.floor(total * 0.34)), Math.min(170, Math.floor(total * 0.72))];
    if (player.fruitStage < 2 && player.eaten >= thresholds[player.fruitStage]) {
      player.fruitStage += 1;
      player.fruitVisibleUntil = this.timeMs + 9_000;
      this.events.push({ type: "fruit-appeared", stage: player.fruitStage });
    }
  }

  checkLevelComplete() {
    const player = this.activePlayer;
    if (player.pellets.size || player.energizers.size || this.phase !== "playing") return;
    this.phase = "level-complete";
    this.phaseTicks = 18;
    this.showMessage("LEVEL COMPLETE", 18);
    this.events.push({ type: "level-complete", player: player.number, level: player.level });
  }

  startNextLevel() {
    const player = this.activePlayer;
    player.level += 1;
    player.lives += 1;
    player.hypers = Math.min(9, player.hypers + 1);
    player.pellets = cloneSet(this.parsedMaze.pellets);
    player.energizers = cloneSet(this.parsedMaze.energizers);
    player.eaten = 0;
    player.fruitStage = 0;
    player.fruitVisibleUntil = 0;
    this.resetActors();
    this.phase = "ready";
    this.phaseTicks = 11;
    this.showMessage("GET SET!", 11);
  }

  resetActors() {
    this.cat = { position: clonePosition(CAT_START), direction: DIRECTIONS.LEFT, queuedDirection: DIRECTIONS.LEFT };
    this.ghosts = Array.from({ length: 4 }, (_, index) => createGhost(index));
    this.levelTimeMs = 0;
    this.modeIndex = 0;
    this.modeElapsedMs = 0;
    this.mode = MODE_SCHEDULE_MS[0][0];
    this.frightenedUntil = 0;
    this.frightenedChain = 0;
  }

  addScore(points) {
    const player = this.activePlayer;
    player.score += points;
    while (player.score >= player.nextExtraScore) {
      player.lives += 1;
      player.nextExtraScore += 10_000;
      this.events.push({ type: "extra-cat", player: player.number });
    }
  }

  showMessage(message, ticks = 8) {
    this.message = message;
    this.messageTicks = ticks;
  }

  canEnter(position, actor) {
    if (position.y < 0 || position.y >= MAZE_HEIGHT || position.x < 0 || position.x >= MAZE_WIDTH) return false;
    return isPassableTile(this.tiles[position.y][position.x], actor);
  }

  snapshot() {
    const player = this.activePlayer;
    return {
      phase: this.phase,
      message: this.message,
      activePlayer: player.number,
      players: this.players.map((item) => ({
        number: item.number,
        score: item.score,
        lives: item.lives,
        level: item.level,
        hypers: item.hypers,
        gameOver: item.gameOver,
      })),
      cat: { position: clonePosition(this.cat.position), direction: this.cat.direction.name, mouthOpen: this.stepCount % 2 === 0 },
      ghosts: this.ghosts.map((ghost) => ({
        index: ghost.index,
        position: clonePosition(ghost.position),
        frightened: this.timeMs < this.frightenedUntil && !ghost.eaten,
        warning: this.timeMs < this.frightenedUntil && this.frightenedUntil - this.timeMs <= 2_000 && this.stepCount % 2 === 0,
        eaten: ghost.eaten,
      })),
      pellets: player.pellets,
      energizers: player.energizers,
      fruitVisible: player.fruitVisibleUntil > this.timeMs,
      fruitPosition: FRUIT_POSITION,
      events: [...this.events],
    };
  }
}

export const DEFAULT_HIGH_SCORES = Object.freeze([
  Object.freeze({ name: "SCUMBAG", score: 956 }),
  Object.freeze({ name: "Alan", score: 936 }),
  Object.freeze({ name: "BUMBLER", score: 762 }),
  Object.freeze({ name: "STUPIDO", score: 690 }),
  Object.freeze({ name: "SUPERSTUD", score: 648 }),
]);

export function normalizeHighScores(scores) {
  const safe = Array.isArray(scores) ? scores : [];
  return safe
    .map((entry) => ({
      name: String(entry?.name || "ANON").slice(0, 9),
      score: Math.max(0, Math.trunc(Number(entry?.score) || 0)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function insertHighScore(scores, entry) {
  return normalizeHighScores([...(scores || []), entry]);
}
