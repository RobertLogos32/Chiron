import { useCallback, useState } from 'react';
import { noteIntersects, rectangle, unionBounds } from '../lib/geometry';
import type {
  Bounds,
  BoundsFor,
  CommitNotes,
  Note,
  Point,
  PointerGesture,
} from '../model/types';

type SelectionStart = {
  point: Point;
  mode: 'select' | 'ai';
  hitId?: string;
  append: boolean;
  tolerance: number;
};

export function useBoardSelection(
  notes: Note[],
  commit: CommitNotes,
  boundsFor: BoundsFor,
) {
  const [selected, setSelected] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [aiArea, setAiArea] = useState<Bounds | null>(null);
  const selectedNotes = notes.filter((note) => selected.includes(note.id));
  const bounds = unionBounds(selectedNotes.map(boundsFor));

  const clearSelected = useCallback(() => setSelected([]), []);
  const closeAi = useCallback(() => setAiArea(null), []);
  const clear = useCallback(() => {
    setSelected([]);
    setAiArea(null);
  }, []);
  const selectAll = () => setSelected(notes.map((note) => note.id));
  const deleteSelected = () => {
    if (!selected.length) return;
    const ids = new Set(selected);
    commit((current) => current.filter((note) => !ids.has(note.id)));
    setSelected([]);
  };

  function begin({
    point,
    mode,
    hitId,
    append,
    tolerance,
  }: SelectionStart): PointerGesture {
    const previous = append ? selected : [];
    let end = point;
    if (mode === 'ai') clear();
    setMarquee(rectangle(point, point));

    return {
      move(next) {
        end = next;
        setMarquee(rectangle(point, end));
      },
      finish() {
        const area = rectangle(point, end);
        setMarquee(null);
        if (mode === 'ai') {
          if (area.width >= tolerance && area.height >= tolerance) setAiArea(area);
          return;
        }
        if (area.width < tolerance && area.height < tolerance) {
          const toggled = hitId && previous.includes(hitId);
          setSelected(
            !hitId
              ? previous
              : toggled
                ? previous.filter((id) => id !== hitId)
                : [...previous, hitId],
          );
          return;
        }
        const hits = notes
          .filter((note) => noteIntersects(note, area, boundsFor))
          .map((note) => note.id);
        setSelected([...new Set([...previous, ...hits])]);
      },
    };
  }

  return {
    selected,
    count: selectedNotes.length,
    bounds,
    marquee,
    aiArea,
    begin,
    clear,
    clearSelected,
    closeAi,
    selectAll,
    deleteSelected,
  };
}
