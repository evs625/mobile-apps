import {
  CatChumGame as OriginalCatChumGame,
  DEFAULT_HIGH_SCORES,
  DIRECTIONS,
  DIRECTION_ORDER,
  MAZE_HEIGHT,
  MAZE_SOURCE,
  MAZE_WIDTH,
  createSeededRandom,
  difficultyInterval,
  displayTile,
  insertHighScore,
  normalizeHighScores,
  opposite,
  parseMaze,
} from "./engine.js?original";

export {
  DEFAULT_HIGH_SCORES,
  DIRECTIONS,
  DIRECTION_ORDER,
  MAZE_HEIGHT,
  MAZE_SOURCE,
  MAZE_WIDTH,
  createSeededRandom,
  difficultyInterval,
  displayTile,
  insertHighScore,
  normalizeHighScores,
  opposite,
  parseMaze,
};

const WALLS = new Set(["+", "-", "|", "/"]);
const CAT_START = Object.freeze({ x: 24, y: 17 });

function key(x, y) {
  return `${x},${y}`;
}

function sameDirection(a, b) {
  return Boolean(a && b && a.name === b.name);
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function isPassableTile(tile, actor = "cat") {
  if (WALLS.has(tile)) return false;
  if (tile === "=" && actor === "cat") return false;
  return true;
}

export function movePosition(position, direction) {
  let x = position.x + direction.dx;
  let y = position.y + direction.dy;

  if (x < 0 && y >= 0 && y < MAZE_HEIGHT && MAZE_SOURCE[y][0] === "<") x = MAZE_WIDTH - 1;
  if (x >= MAZE_WIDTH && y >= 0 && y < MAZE_HEIGHT && MAZE_SOURCE[y][MAZE_WIDTH - 1] === ">") x = 0;
  if (y < 0 && x >= 0 && x < MAZE_WIDTH && MAZE_SOURCE[0][x] === "^") y = MAZE_HEIGHT - 1;
  if (y >= MAZE_HEIGHT && x >= 0 && x < MAZE_WIDTH && MAZE_SOURCE[MAZE_HEIGHT - 1][x] === "v") y = 0;

  return { x, y };
}

export function availableDirections(tiles, position, actor = "cat") {
  return DIRECTION_ORDER.filter((direction) => {
    const next = movePosition(position, direction);
    if (next.y < 0 || next.y >= MAZE_HEIGHT || next.x < 0 || next.x >= MAZE_WIDTH) return false;
    return isPassableTile(tiles[next.y][next.x], actor);
  });
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
    return distanceSquared(nextPosition, target) < distanceSquared(bestPosition, target) ? direction : best;
  }, null);
}

function reachableCatTiles(tiles) {
  const reached = new Set([key(CAT_START.x, CAT_START.y)]);
  const queue = [{ ...CAT_START }];
  while (queue.length) {
    const position = queue.shift();
    for (const direction of availableDirections(tiles, position, "cat")) {
      const next = movePosition(position, direction);
      const nextKey = key(next.x, next.y);
      if (reached.has(nextKey)) continue;
      reached.add(nextKey);
      queue.push(next);
    }
  }
  return reached;
}

export class CatChumGame extends OriginalCatChumGame {
  constructor(options = {}) {
    super(options);
    this.reachableCatTiles = reachableCatTiles(this.tiles);
  }

  canEnter(position, actor) {
    if (position.y < 0 || position.y >= MAZE_HEIGHT || position.x < 0 || position.x >= MAZE_WIDTH) return false;
    return isPassableTile(this.tiles[position.y][position.x], actor);
  }

  moveCat() {
    const queuedNext = movePosition(this.cat.position, this.cat.queuedDirection);
    if (this.canEnter(queuedNext, "cat")) this.cat.direction = this.cat.queuedDirection;
    const next = movePosition(this.cat.position, this.cat.direction);
    if (this.canEnter(next, "cat")) this.cat.position = next;
  }

  moveGhosts() {
    const frightened = this.timeMs < this.frightenedUntil;
    for (const ghost of this.ghosts) {
      if (!ghost.released) continue;
      if (frightened && this.stepCount % 2 === 0 && !ghost.eaten) continue;

      if (ghost.eaten && ghost.position.x === 24 && ghost.position.y === 11) {
        ghost.eaten = false;
        ghost.released = true;
        ghost.position = { x: 24, y: 9 };
      }

      const legal = availableDirections(this.tiles, ghost.position, "ghost");
      if (!legal.length) continue;
      const reverse = opposite(ghost.direction);
      const nonReverse = legal.filter((direction) => !sameDirection(direction, reverse));
      const pool = nonReverse.length ? nonReverse : legal;

      if (frightened && !ghost.eaten) {
        ghost.direction = pool[Math.floor(this.random() * pool.length)];
      } else {
        const target = ghost.eaten ? { x: 24, y: 11 } : this.ghostTarget(ghost);
        ghost.direction = chooseTargetDirection(this.tiles, ghost.position, ghost.direction, target, "ghost");
      }
      ghost.position = movePosition(ghost.position, ghost.direction);
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
    for (const tileKey of this.reachableCatTiles) {
      const [x, y] = tileKey.split(",").map(Number);
      const minGhostDistance = Math.min(...this.ghosts.map((ghost) => distanceSquared({ x, y }, ghost.position)));
      if (minGhostDistance >= 36) safeTiles.push({ x, y });
    }
    const pool = safeTiles.length ? safeTiles : [{ ...CAT_START }];
    this.cat.position = { ...pool[Math.floor(this.random() * pool.length)] };
    player.hypers -= 1;
    this.showMessage("SHECKY, GET THE JET!", 8);
    this.events.push({ type: "hyperspace", player: player.number });
    return true;
  }
}
