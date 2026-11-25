import { useEffect, useState } from 'react';
import type { NotesProtection } from '@whiteboard/model/history';
import { useDocumentHistory } from '@whiteboard/hooks/useDocumentHistory';
import { loadAnnotationPages, saveAnnotationPages } from '../services/storage';

export function usePageAnnotations(
  documentId: string,
  page: number,
  protect?: NotesProtection,
) {
  const history = useDocumentHistory(
    `pdf:${documentId}:${page}`,
    () => loadAnnotationPages(documentId)[page] ?? [],
    protect,
  );
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const save = () => {
      try {
        saveAnnotationPages(documentId, {
          ...loadAnnotationPages(documentId),
          [page]: history.getNotes(),
        });
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
    };
    const timer = setTimeout(save, 350);
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [documentId, page, history.notes, history.getNotes]);
  return { ...history, saveError };
}
