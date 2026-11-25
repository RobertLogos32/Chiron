import { useDocumentHistory } from './useDocumentHistory';
import { loadNotes } from '../services/storage';
import type { NotesProtection } from '../model/history';

export function useBoardHistory(documentId?: string, protect?: NotesProtection) {
  return useDocumentHistory(
    `notebook:${documentId ?? 'default'}`,
    () => loadNotes(documentId),
    protect,
  );
}
