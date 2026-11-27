import type { ExplainedRegion } from '../model/ai';
import type { Bounds, Camera } from '../model/types';

export function annotationScreenBounds(
  region: ExplainedRegion,
  crop: Bounds,
  camera: Camera,
  pane: Bounds,
): Bounds {
  return {
    x: pane.x + camera.x + (crop.x + (crop.width * region.left) / 1000) * camera.zoom,
    y: pane.y + camera.y + (crop.y + (crop.height * region.top) / 1000) * camera.zoom,
    width: (crop.width * (region.right - region.left) * camera.zoom) / 1000,
    height: (crop.height * (region.bottom - region.top) * camera.zoom) / 1000,
  };
}

export function intersectBounds(first: Bounds, second: Bounds): Bounds | null {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const width = Math.min(first.x + first.width, second.x + second.width) - x;
  const height = Math.min(first.y + first.height, second.y + second.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
