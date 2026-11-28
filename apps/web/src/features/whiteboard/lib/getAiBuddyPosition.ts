import type { Bounds, Camera, Point, Size } from '../model/types';
import { intersectBounds } from './aiAnnotations.ts';

type BuddyPosition = Point & { placement: 'selection' | 'page' };
const margin = 12;
const gap = 14;
const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
const contains = (outer: Bounds, inner: Bounds) =>
  inner.x >= outer.x + margin &&
  inner.y >= outer.y + margin &&
  inner.x + inner.width <= outer.x + outer.width - margin &&
  inner.y + inner.height <= outer.y + outer.height - margin;

const screenArea = (area: Bounds, camera: Camera): Bounds => ({
  x: area.x * camera.zoom + camera.x,
  y: area.y * camera.zoom + camera.y,
  width: area.width * camera.zoom,
  height: area.height * camera.zoom,
});

export function isAiAreaVisible(area: Bounds, camera: Camera, pane: Bounds) {
  return !!intersectBounds(screenArea(area, camera), pane);
}

export function positionAiBuddy({
  area,
  camera,
  pane,
  viewport,
  size,
  obstacles = [],
}: {
  area: Bounds;
  camera: Camera;
  pane: Bounds;
  viewport: Bounds;
  size: Size;
  obstacles?: Bounds[];
}): BuddyPosition {
  const selection = screenArea(area, camera);
  const anchored = {
    x: selection.x + selection.width - size.width,
    y: selection.y + selection.height + gap,
    ...size,
  };
  if (
    camera.zoom >= 0.93 &&
    intersectBounds(selection, pane) &&
    contains(pane, anchored) &&
    !obstacles.some((obstacle) => overlaps(anchored, obstacle))
  ) {
    return { x: anchored.x, y: anchored.y, placement: 'selection' };
  }

  // Docking depends only on the visible page and its controls, never on pan or
  // zoom. The buddy returns to its original anchor as soon as it is visible.
  const preferred = {
    x: Math.max(viewport.x + margin, viewport.x + viewport.width - size.width - margin),
    y: Math.max(viewport.y + margin, viewport.y + viewport.height - size.height - margin),
  };
  const paddedObstacles = obstacles.map((obstacle) => ({
    x: obstacle.x - margin,
    y: obstacle.y - margin,
    width: obstacle.width + margin * 2,
    height: obstacle.height + margin * 2,
  }));
  const xs = [preferred.x, ...paddedObstacles.map((obstacle) => obstacle.x - size.width)];
  const ys = [
    preferred.y,
    ...paddedObstacles.map((obstacle) => obstacle.y - size.height),
  ];
  const candidates = xs
    .flatMap((x) => ys.map((y) => ({ x, y, ...size })))
    .filter(
      (candidate) =>
        contains(viewport, candidate) &&
        !paddedObstacles.some((obstacle) => overlaps(candidate, obstacle)),
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - preferred.x, a.y - preferred.y) -
        Math.hypot(b.x - preferred.x, b.y - preferred.y),
    );
  const docked = candidates[0] ?? preferred;
  return { x: docked.x, y: docked.y, placement: 'page' };
}
