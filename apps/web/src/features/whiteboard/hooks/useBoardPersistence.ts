import { useEffect, useState } from 'react';
import type { Camera, Note } from '../model/types';
import { saveDocument } from '../services/storage';

export function useBoardPersistence(
  notes: Note[],
  camera: Camera,
  documentId?: string,
  getNotes?: () => Note[],
) {
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const save = () => {
      try {
        saveDocument(getNotes?.() ?? notes, camera, documentId);
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
  }, [notes, camera, documentId, getNotes]);

  return saveError;
}
