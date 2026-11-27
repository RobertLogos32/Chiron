import { useCallback, useRef, useSyncExternalStore } from 'react';
import { createDocumentHistory } from '../model/documentHistory';
import type { NotesProtection } from '../model/history';
import type { Note, NotesUpdate } from '../model/types';

const documents = new Map<string, ReturnType<typeof createDocumentHistory>>();

export function useDocumentHistory(
  key: string,
  load: () => Note[],
  protect?: NotesProtection,
) {
  let store = documents.get(key);
  if (!store) {
    store = createDocumentHistory(load());
    documents.set(key, store);
  }
  const document = store;
  const history = useSyncExternalStore(document.subscribe, document.getSnapshot);
  const protection = useRef(protect);
  protection.current = protect;
  const commit = useCallback(
    (update: NotesUpdate, protectCommit = protection.current) =>
      document.dispatch({ type: 'commit', update, protect: protectCommit }),
    [document],
  );
  const undo = useCallback(
    () => document.dispatch({ type: 'undo', protect: protection.current }),
    [document],
  );
  const redo = useCallback(
    () => document.dispatch({ type: 'redo', protect: protection.current }),
    [document],
  );
  const getNotes = useCallback(() => document.getSnapshot().present, [document]);
  return {
    notes: history.present,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    commit,
    undo,
    redo,
    getNotes,
  };
}
