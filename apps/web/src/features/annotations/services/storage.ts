import type { Note } from '@whiteboard/model/types';

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export type AnnotationPages = Record<number, Note[]>;
const keyFor = (id: string) => `chiron.pdf.annotations.v1.${encodeURIComponent(id)}`;

function validNotes(value: unknown): value is Note[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((note) => {
    if (
      !note ||
      typeof note.id !== 'string' ||
      ids.has(note.id) ||
      !/^#[a-f0-9]{6}$/i.test(note.color)
    )
      return false;
    ids.add(note.id);
    if (note.type === 'stroke')
      return (
        ['pen', 'highlighter'].includes(note.tool) &&
        Number.isFinite(note.width) &&
        note.width > 0 &&
        note.width <= 64 &&
        Array.isArray(note.points) &&
        note.points.length >= 4 &&
        note.points.length % 2 === 0 &&
        note.points.every(
          (point: unknown) => typeof point === 'number' && Number.isFinite(point),
        )
      );
    return (
      note.type === 'text' &&
      Number.isFinite(note.x) &&
      Number.isFinite(note.y) &&
      typeof note.text === 'string' &&
      note.text.length <= 20000 &&
      Number.isFinite(note.fontSize) &&
      note.fontSize >= 12 &&
      note.fontSize <= 48 &&
      (note.width === undefined ||
        (Number.isFinite(note.width) && note.width >= 40 && note.width <= 600))
    );
  });
}

export function loadAnnotationPages(id: string, storage?: StoragePort): AnnotationPages {
  try {
    const saved = JSON.parse((storage ?? localStorage).getItem(keyFor(id)) ?? '{}');
    if (saved.version !== 1 || !saved.pages || typeof saved.pages !== 'object') return {};
    const pages: AnnotationPages = {};
    for (const [page, notes] of Object.entries(saved.pages)) {
      if (/^\d+$/.test(page) && Number(page) >= 1 && validNotes(notes)) {
        pages[Number(page)] = notes;
      }
    }
    return pages;
  } catch {
    return {};
  }
}

export function saveAnnotationPages(
  id: string,
  pages: AnnotationPages,
  storage: StoragePort = localStorage,
) {
  storage.setItem(keyFor(id), JSON.stringify({ version: 1, pages }));
}
