import { useState } from 'react';
import { eraseNotes } from '../lib/geometry';
import type { BoundsFor, CommitNotes, Note, Point, PointerGesture } from '../model/types';

export function useEraserGesture(
  commit: CommitNotes,
  boundsFor: BoundsFor,
  protect?: (previous: Note[], next: Note[]) => Note[],
  isLocked?: (note: Note) => boolean,
) {
  const [preview, setPreview] = useState<Note[] | null>(null);

  function begin(point: Point, original: Note[], radius: number): PointerGesture {
    const apply = (current: Note[], a: Point, b: Point) => {
      const next = current.flatMap((note) =>
        isLocked?.(note) ? [note] : eraseNotes([note], a, b, radius, boundsFor),
      );
      if (
        next.length === current.length &&
        next.every((note, index) => note === current[index])
      )
        return current;
      return protect?.(current, next) ?? next;
    };
    let notes = apply(original, point, point);
    let last = point;
    setPreview(notes);

    return {
      move(next) {
        notes = apply(notes, last, next);
        last = next;
        setPreview(notes);
      },
      finish() {
        setPreview(null);
        if (notes === original) return;
        // Another view of the same page may have added notes during the gesture: apply only
        // what this eraser changed instead of replacing the page with its own snapshot.
        const kept = new Set(notes);
        const removed = new Set(
          original.filter((note) => !kept.has(note)).map((note) => note.id),
        );
        const known = new Set(original);
        const added = notes.filter((note) => !known.has(note));
        commit((current) =>
          current === original
            ? notes
            : [...current.filter((note) => !removed.has(note.id)), ...added],
        );
      },
    };
  }

  return { preview, begin };
}
