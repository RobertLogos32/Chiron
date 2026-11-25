import type { Note, NotesUpdate } from './types';

const HISTORY_LIMIT = 50;

export type NoteHistory = { past: Note[][]; present: Note[]; future: Note[][] };
export type NotesProtection = (previous: Note[], next: Note[]) => Note[];
export type HistoryAction = (
  { type: 'commit'; update: NotesUpdate } | { type: 'undo' } | { type: 'redo' }
) & { protect?: NotesProtection };

export function createHistory(notes: Note[]): NoteHistory {
  return { past: [], present: notes, future: [] };
}

export function historyReducer(state: NoteHistory, action: HistoryAction): NoteHistory {
  switch (action.type) {
    case 'commit': {
      const proposed = action.update(state.present);
      const next = action.protect?.(state.present, proposed) ?? proposed;
      if (next === state.present) return state;
      return {
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.present],
        present: next,
        future: [],
      };
    }
    case 'undo': {
      if (!state.past.length) return state;
      const proposed = state.past[state.past.length - 1];
      const next = action.protect?.(state.present, proposed) ?? proposed;
      if (next === state.present) return state;
      return {
        past: state.past.slice(0, -1),
        present: next,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (!state.future.length) return state;
      const proposed = state.future[0];
      const next = action.protect?.(state.present, proposed) ?? proposed;
      if (next === state.present) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}
