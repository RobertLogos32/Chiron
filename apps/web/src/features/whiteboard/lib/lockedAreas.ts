import { noteIntersects } from './geometry.ts';
import type { Bounds, BoundsFor, Note, Point } from '../model/types';

export function noteIsLocked(note: Note, areas: Bounds[], boundsFor: BoundsFor) {
  return areas.some((area) => noteIntersects(note, area, boundsFor));
}

export function segmentIsLocked(a: Point, b: Point, radius: number, areas: Bounds[]) {
  return areas.some((area) =>
    noteIntersects(
      {
        id: '',
        type: 'stroke',
        tool: 'pen',
        color: '',
        width: radius * 2,
        points: [a.x, a.y, b.x, b.y],
      },
      area,
    ),
  );
}

// Existing objects touching a busy area stay immutable, including when an undo
// or erase operation started outside that area. New objects cannot enter it.
export function protectLockedNotes(
  previous: Note[],
  next: Note[],
  areas: Bounds[],
  boundsFor: BoundsFor,
): Note[] {
  if (!areas.length || previous === next) return next;
  const originals = new Map(previous.map((note) => [note.id, note]));
  const protectedNotes = previous.filter((note) => noteIsLocked(note, areas, boundsFor));
  const protectedIds = new Set(protectedNotes.map((note) => note.id));
  const result = next.flatMap<Note>((note) => {
    const original = originals.get(note.id);
    if (protectedIds.has(note.id)) return [original!];
    if (note !== original && noteIsLocked(note, areas, boundsFor))
      return original ? [original] : [];
    return [note];
  });
  const present = new Set(result.map((note) => note.id));
  for (const note of protectedNotes)
    if (!present.has(note.id)) {
      const index = previous.indexOf(note);
      result.splice(Math.min(index, result.length), 0, note);
    }
  return result.length === previous.length &&
    result.every((note, index) => note === previous[index])
    ? previous
    : result;
}
