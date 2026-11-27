import type { BoardWritePlacement, Bounds, Size } from '../model/types';
import { intersectBounds } from './aiAnnotations.ts';

const CLEARANCE = 8;

export function boardWriteSpaces(
  selection: Bounds,
  occupied: Bounds[],
  minimum: Size,
  placement?: BoardWritePlacement,
): Bounds[] {
  const inset = {
    x: selection.x + CLEARANCE,
    y: selection.y + CLEARANCE,
    width: selection.width - CLEARANCE * 2,
    height: selection.height - CLEARANCE * 2,
  };
  const fits = (bounds: Bounds) =>
    bounds.width >= minimum.width && bounds.height >= minimum.height;
  if (!fits(inset)) return [];

  let spaces = [inset];
  for (const object of occupied) {
    const obstacle = {
      x: object.x - CLEARANCE,
      y: object.y - CLEARANCE,
      width: object.width + CLEARANCE * 2,
      height: object.height + CLEARANCE * 2,
    };
    if (!intersectBounds(inset, obstacle)) continue;
    spaces = spaces.flatMap((space) => subtractObstacle(space, obstacle)).filter(fits);
    spaces = spaces.filter(
      (space, index) =>
        !spaces.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            (otherIndex < index ||
              other.width > space.width ||
              other.height > space.height) &&
            other.x <= space.x &&
            other.y <= space.y &&
            other.x + other.width >= space.x + space.width &&
            other.y + other.height >= space.y + space.height,
        ),
    );
    if (!spaces.length) return [];
  }

  return spaces.sort(
    (a, b) => (placement === 'below' ? b.y - a.y : a.y - b.y) || a.x - b.x,
  );
}

// The four rectangles preserve all usable space around an axis-aligned obstacle.
function subtractObstacle(space: Bounds, obstacle: Bounds): Bounds[] {
  const blocked = intersectBounds(space, obstacle);
  if (!blocked) return [space];
  const right = blocked.x + blocked.width;
  const bottom = blocked.y + blocked.height;
  return [
    { ...space, width: blocked.x - space.x },
    { ...space, x: right, width: space.x + space.width - right },
    { ...space, height: blocked.y - space.y },
    { ...space, y: bottom, height: space.y + space.height - bottom },
  ];
}
