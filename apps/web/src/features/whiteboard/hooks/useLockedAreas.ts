import { useCallback } from 'react';
import { noteIsLocked, protectLockedNotes } from '../lib/lockedAreas';
import { noteBounds } from '../lib/geometry';
import type { Bounds, BoundsFor, Note } from '../model/types';

export function useLockedAreas(areas: Bounds[], boundsFor: BoundsFor) {
  const isLocked = useCallback(
    (note: Note) => noteIsLocked(note, areas, boundsFor),
    [areas, boundsFor],
  );
  // New text is measured before Konva renders it; use its proposed content.
  const blocksText = useCallback(
    (note: Note) => noteIsLocked(note, areas, noteBounds),
    [areas],
  );
  const protect = useCallback(
    (previous: Note[], next: Note[]) =>
      protectLockedNotes(previous, next, areas, boundsFor),
    [areas, boundsFor],
  );
  return { areas, isLocked, blocksText, protect };
}
