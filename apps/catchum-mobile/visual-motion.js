export const DIRECTION_VECTORS = Object.freeze({
  up: Object.freeze({ dx: 0, dy: -1 }),
  left: Object.freeze({ dx: -1, dy: 0 }),
  down: Object.freeze({ dx: 0, dy: 1 }),
  right: Object.freeze({ dx: 1, dy: 0 }),
});

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function directionVector(direction) {
  if (typeof direction === "string") return DIRECTION_VECTORS[direction] || null;
  if (direction && Number.isFinite(direction.dx) && Number.isFinite(direction.dy)) return direction;
  return null;
}

export function projectedPosition(position, direction, progress) {
  const vector = directionVector(direction);
  if (!position || !vector) return position ? { x: position.x, y: position.y } : null;
  const amount = clamp01(progress);
  return {
    x: position.x + vector.dx * amount,
    y: position.y + vector.dy * amount,
  };
}

export function interpolatePosition(from, to, progress) {
  if (!from || !to) return from || to || null;
  const amount = clamp01(progress);
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function wrappedRenderPositions(position, width, height) {
  if (!position) return [];
  const xOffsets = [0];
  const yOffsets = [0];

  if (position.x < 0) xOffsets.push(width);
  else if (position.x > width - 1) xOffsets.push(-width);

  if (position.y < 0) yOffsets.push(height);
  else if (position.y > height - 1) yOffsets.push(-height);

  const positions = [];
  for (const xOffset of xOffsets) {
    for (const yOffset of yOffsets) {
      positions.push({ x: position.x + xOffset, y: position.y + yOffset });
    }
  }
  return positions;
}

export function remainingProgress(progress, startProgress) {
  const start = clamp01(startProgress);
  if (start >= 1) return 1;
  return clamp01((clamp01(progress) - start) / (1 - start));
}
