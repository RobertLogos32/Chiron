import { useLayoutEffect, useRef, useState } from 'react';
import type {
  Camera,
  CommitNotes,
  Note,
  Point,
  Size,
  TextDraft,
  TextNote,
} from '../model/types';

export function useTextEditor(
  notes: Note[],
  commit: CommitNotes,
  camera: Camera,
  isBlocked?: (note: Note) => boolean,
) {
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!draft || !textarea) return;
    textarea.focus();
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 4}px`;
  }, [draft, camera.zoom]);

  const open = (
    point: Point,
    id: string | undefined,
    color: string,
    fontSize: number,
    viewport: Size,
  ) => {
    const existing = notes.find((note) => note.id === id);
    if (existing?.type === 'text') {
      if (existing.latex || isBlocked?.(existing)) return;
      setDraft(existing);
      return;
    }
    const availableWidth =
      (viewport.width - point.x * camera.zoom - camera.x - 24) / camera.zoom;
    setDraft({
      id: crypto.randomUUID(),
      ...point,
      text: '',
      color,
      fontSize,
      width: Math.min(600, Math.max(160, availableWidth)),
    });
  };

  const save = () => {
    if (!draft) return;
    const text = draft.text.trimEnd();
    const existing = notes.find((note) => note.id === draft.id);
    if (existing?.type === 'text' && existing.text === text) {
      setDraft(null);
      return;
    }
    if (text.trim()) {
      const note: TextNote = { ...draft, type: 'text', text };
      commit((current) =>
        existing
          ? current.map((item) => (item.id === note.id ? note : item))
          : [...current, note],
      );
    } else if (existing) {
      commit((current) => current.filter((note) => note.id !== draft.id));
    }
    setDraft(null);
  };

  const change = (text: string) =>
    setDraft((previous) => {
      if (!previous) return null;
      const next = { ...previous, text };
      return isBlocked?.({ ...next, type: 'text' }) ? previous : next;
    });
  const cancel = () => setDraft(null);

  return { draft, ref, open, save, change, cancel };
}
