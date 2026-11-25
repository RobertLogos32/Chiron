import type { Bounds, Camera, Point } from '../model/types';
export function positionPrompt(
  area: Bounds,
  camera: Camera,
  viewport: { width: number; height: number },
  width: number,
  height: number,
): Point {
  const margin = 12,
    gap = 14;
  const rect = {
    x: area.x * camera.zoom + camera.x,
    y: area.y * camera.zoom + camera.y,
    width: area.width * camera.zoom,
    height: area.height * camera.zoom,
  };
  const minTop = Math.min(44, Math.max(margin, viewport.height - height - margin));
  const bottom = viewport.height - (viewport.width <= 760 ? 134 : 88) - margin;
  const maxTop = Math.max(minTop, bottom - height);
  const clampX = (x: number) =>
    Math.max(margin, Math.min(viewport.width - width - margin, x));
  const clampY = (y: number) => Math.max(minTop, Math.min(maxTop, y));
  const centerX = rect.x + (rect.width - width) / 2;
  const centerY = rect.y + (rect.height - height) / 2;
  const candidates = [
    { x: centerX, y: rect.y + rect.height + gap },
    { x: centerX, y: rect.y - gap - height },
    { x: rect.x + rect.width + gap, y: centerY },
    { x: rect.x - gap - width, y: centerY },
  ].map((point) => ({ x: clampX(point.x), y: clampY(point.y) }));
  const overlap = (point: Point) =>
    Math.max(
      0,
      Math.min(point.x + width, rect.x + rect.width) - Math.max(point.x, rect.x),
    ) *
    Math.max(
      0,
      Math.min(point.y + height, rect.y + rect.height) - Math.max(point.y, rect.y),
    );
  return (
    candidates.find((point) => overlap(point) === 0) ??
    candidates.reduce((best, point) => (overlap(point) < overlap(best) ? point : best))
  );
}
