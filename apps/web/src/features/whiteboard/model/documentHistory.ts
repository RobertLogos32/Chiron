import { createHistory, historyReducer, type HistoryAction } from './history.ts';
import type { Note } from './types';

export function createDocumentHistory(notes: Note[]) {
  let history = createHistory(notes);
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => history,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action: HistoryAction) {
      const next = historyReducer(history, action);
      if (next === history) return;
      history = next;
      listeners.forEach((listener) => listener());
    },
  };
}
