import { DEFAULT_CAMERA, MIN_BOARD_TEXT_WIDTH } from '../config/defaults';
import type { Appearance, Camera, Note } from '../model/types';

// Keep the existing keys and document format so saved user notes remain compatible.
const DOCUMENT_KEY = 'quaderno.board.v1';
export const APPEARANCE_KEY = 'quaderno.board.settings.v1';

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}');
    return {
      theme: saved.theme === 'light' ? 'light' : 'dark',
      pattern: ['blank', 'ruled', 'grid', 'dots'].includes(saved.pattern)
        ? saved.pattern
        : 'dots',
    };
  } catch {
    return { theme: 'dark', pattern: 'dots' };
  }
}

export function saveAppearance(appearance: Appearance) {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
}

function documentKey(documentId?: string) {
  return documentId ? `${DOCUMENT_KEY}:${documentId}` : DOCUMENT_KEY;
}

export function loadCamera(documentId?: string): Camera {
  try {
    const camera = JSON.parse(
      localStorage.getItem(documentKey(documentId)) ?? '{}',
    ).camera;
    if (!camera || !Number.isFinite(camera.x) || !Number.isFinite(camera.y))
      return DEFAULT_CAMERA;
    return {
      x: camera.x,
      y: camera.y,
      zoom: Number.isFinite(camera.zoom) ? Math.max(0.25, Math.min(4, camera.zoom)) : 1,
    };
  } catch {
    return DEFAULT_CAMERA;
  }
}

function isValidNote(note: Note, ids: Set<string>): boolean {
  if (!note || typeof note.id !== 'string' || ids.has(note.id)) return false;
  if (typeof note.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(note.color)) return false;
  ids.add(note.id);

  if (note.type === 'stroke') {
    return (
      ['pen', 'highlighter'].includes(note.tool) &&
      Number.isFinite(note.width) &&
      note.width > 0 &&
      note.width <= 64 &&
      Array.isArray(note.points) &&
      note.points.length >= 4 &&
      note.points.length % 2 === 0 &&
      note.points.every((point) => typeof point === 'number' && Number.isFinite(point))
    );
  }

  return (
    note.type === 'text' &&
    Number.isFinite(note.x) &&
    Number.isFinite(note.y) &&
    typeof note.text === 'string' &&
    note.text.length <= 20000 &&
    Number.isFinite(note.fontSize) &&
    note.fontSize >= 12 &&
    note.fontSize <= 48 &&
    (note.latex === undefined ||
      (!!note.latex &&
        Number.isFinite(note.latex.width) &&
        Number.isFinite(note.latex.height) &&
        note.latex.width > 0 &&
        note.latex.width <= 600 &&
        note.latex.height > 0 &&
        note.latex.height <= 1600)) &&
    (note.width === undefined ||
      (Number.isFinite(note.width) &&
        note.width >= MIN_BOARD_TEXT_WIDTH &&
        note.width <= 600))
  );
}

export function loadNotes(documentId?: string): Note[] {
  try {
    const document = JSON.parse(localStorage.getItem(documentKey(documentId)) ?? '{}');
    if (document.version !== 1 || !Array.isArray(document.notes)) return [];
    const ids = new Set<string>();
    return document.notes.every((note: Note) => isValidNote(note, ids))
      ? document.notes
      : [];
  } catch {
    return [];
  }
}

export function saveDocument(notes: Note[], camera: Camera, documentId?: string) {
  localStorage.setItem(
    documentKey(documentId),
    JSON.stringify({ version: 1, notes, camera }),
  );
}
