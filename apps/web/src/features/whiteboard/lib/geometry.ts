import type { Camera, Note, Point, Stroke } from '../model/types';

export type Bounds = Point & { width: number; height: number };
type Interval = [number, number];
const EPSILON = 1e-8;
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function screenToWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function zoomCamera(camera: Camera, zoom: number, anchor: Point): Camera {
  const next = Math.max(0.25, Math.min(4, zoom));
  const world = screenToWorld(anchor, camera);
  return { x: anchor.x - world.x * next, y: anchor.y - world.y * next, zoom: next };
}

export function rectangle(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function noteBounds(note: Note): Bounds {
  if (note.type === 'text') {
    const fixedSize = note.latex ?? note.visual;
    if (fixedSize)
      return { x: note.x, y: note.y, width: fixedSize.width, height: fixedSize.height };
    const width = note.width ?? 600;
    const lines = note.text.split('\n');
    const rows = lines.reduce(
      (total, line) =>
        total + Math.max(1, Math.ceil((line.length * note.fontSize * 0.65) / width)),
      0,
    );
    return {
      x: note.x,
      y: note.y,
      width: Math.min(
        width,
        Math.max(...lines.map((line) => line.length), 1) * note.fontSize * 0.65,
      ),
      height: rows * note.fontSize * 1.5,
    };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < note.points.length; i += 2) {
    minX = Math.min(minX, note.points[i]);
    maxX = Math.max(maxX, note.points[i]);
    minY = Math.min(minY, note.points[i + 1]);
    maxY = Math.max(maxY, note.points[i + 1]);
  }
  return {
    x: minX - note.width / 2,
    y: minY - note.width / 2,
    width: maxX - minX + note.width,
    height: maxY - minY + note.width,
  };
}

export function overlaps(a: Bounds, b: Bounds) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function expanded(bounds: Bounds, radius: number): Bounds {
  return {
    x: bounds.x - radius,
    y: bounds.y - radius,
    width: bounds.width + radius * 2,
    height: bounds.height + radius * 2,
  };
}

function segmentRect(a: Point, b: Point, rect: Bounds): Interval | null {
  let from = 0,
    to = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, rect.x, rect.x + rect.width],
    [a.y, b.y - a.y, rect.y, rect.y + rect.height],
  ]) {
    if (Math.abs(delta) < EPSILON) {
      if (start < min || start > max) return null;
      continue;
    }
    const first = (min - start) / delta,
      last = (max - start) / delta;
    from = Math.max(from, Math.min(first, last));
    to = Math.min(to, Math.max(first, last));
    if (from > to) return null;
  }
  return [from, to];
}

export function clipStroke(points: number[], rect: Bounds): Point[][] {
  const parts: Point[][] = [];
  let part: Point[] | undefined;
  for (let index = 2; index < points.length; index += 2) {
    const a = { x: points[index - 2], y: points[index - 1] };
    const b = { x: points[index], y: points[index + 1] };
    const interval = segmentRect(a, b, rect);
    if (!interval || interval[0] === interval[1]) {
      part = undefined;
      continue;
    }
    const [from, to] = interval;
    if (!part || from > 0) {
      part = [lerp(a, b, from)];
      parts.push(part);
    }
    part.push(lerp(a, b, to));
    if (to < 1) part = undefined;
  }
  return parts;
}

function segmentCircle(
  a: Point,
  b: Point,
  center: Point,
  radius: number,
): Interval | null {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const x = a.x - center.x,
    y = a.y - center.y;
  const aa = dx * dx + dy * dy;
  if (aa < EPSILON) return x * x + y * y <= radius * radius ? [0, 1] : null;
  const bb = 2 * (x * dx + y * dy),
    cc = x * x + y * y - radius * radius;
  const discriminant = bb * bb - 4 * aa * cc;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const from = Math.max(0, (-bb - root) / (2 * aa)),
    to = Math.min(1, (-bb + root) / (2 * aa));
  return from <= to ? [from, to] : null;
}

// The swept eraser is a capsule: a rectangle joined to two round ends.
function eraserIntervals(
  a: Point,
  b: Point,
  start: Point,
  end: Point,
  radius: number,
): Interval[] {
  const intervals: Interval[] = [];
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy);
  for (const center of [start, end]) {
    const interval = segmentCircle(a, b, center, radius);
    if (interval) intervals.push(interval);
  }
  if (length > EPSILON) {
    const local = (p: Point) => ({
      x: ((p.x - start.x) * dx + (p.y - start.y) * dy) / length,
      y: (-(p.x - start.x) * dy + (p.y - start.y) * dx) / length,
    });
    const interval = segmentRect(local(a), local(b), {
      x: 0,
      y: -radius,
      width: length,
      height: radius * 2,
    });
    if (interval) intervals.push(interval);
  }
  intervals.sort((left, right) => left[0] - right[0]);
  const merged: Interval[] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + EPSILON)
      last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

export function cutStroke(
  stroke: Stroke,
  start: Point,
  end: Point,
  radius: number,
): Stroke[] {
  if (!overlaps(noteBounds(stroke), expanded(rectangle(start, end), radius)))
    return [stroke];
  const pieces: number[][] = [];
  let current: number[] = [],
    changed = false;
  const flush = () => {
    if (current.length >= 4) pieces.push(current);
    current = [];
  };
  for (let i = 0; i < stroke.points.length - 2; i += 2) {
    const a = { x: stroke.points[i], y: stroke.points[i + 1] },
      b = { x: stroke.points[i + 2], y: stroke.points[i + 3] };
    const cuts = eraserIntervals(a, b, start, end, radius + stroke.width / 2);
    if (!cuts.length) {
      if (!current.length) current.push(a.x, a.y);
      current.push(b.x, b.y);
      continue;
    }
    changed = true;
    let cursor = 0;
    for (const [from, to] of [...cuts, [1, 1] as Interval]) {
      if (from > cursor + EPSILON) {
        const left = lerp(a, b, cursor),
          right = lerp(a, b, from);
        if (!current.length) current.push(left.x, left.y);
        current.push(right.x, right.y);
      }
      if (to > from || from < 1) flush();
      cursor = to;
    }
  }
  flush();
  if (!changed) return [stroke];
  return pieces.map((points, index) => ({
    ...stroke,
    id: index === 0 ? stroke.id : crypto.randomUUID(),
    points,
  }));
}

export function eraseNotes(
  notes: Note[],
  start: Point,
  end: Point,
  radius: number,
  boundsFor = noteBounds,
): Note[] {
  let changed = false;
  const result = notes.flatMap<Note>((note) => {
    if (note.type === 'text') {
      if (!segmentRect(start, end, expanded(boundsFor(note), radius))) return [note];
      changed = true;
      return [];
    }
    const pieces = cutStroke(note, start, end, radius);
    if (pieces.length !== 1 || pieces[0] !== note) changed = true;
    return pieces;
  });
  return changed ? result : notes;
}

export function noteIntersects(
  note: Note,
  area: Bounds,
  boundsFor = noteBounds,
): boolean {
  if (!overlaps(boundsFor(note), area)) return false;
  if (note.type === 'text') return true;
  const target = expanded(area, note.width / 2);
  for (let i = 0; i < note.points.length - 2; i += 2) {
    if (
      segmentRect(
        { x: note.points[i], y: note.points[i + 1] },
        { x: note.points[i + 2], y: note.points[i + 3] },
        target,
      )
    )
      return true;
  }
  return false;
}

export function unionBounds(bounds: Bounds[]): Bounds | null {
  if (!bounds.length) return null;
  const x = Math.min(...bounds.map((b) => b.x)),
    y = Math.min(...bounds.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...bounds.map((b) => b.x + b.width)) - x,
    height: Math.max(...bounds.map((b) => b.y + b.height)) - y,
  };
}
