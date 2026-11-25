import { useEffect, useState } from 'react';
import { PdfReaderPage } from '../../../pages/PdfReaderPage';
import { retrieveFile } from '../services/libraryStorage';

const files = new Map<string, Promise<File>>();
function read(id: string) {
  let pending = files.get(id);
  if (!pending) {
    pending = retrieveFile(id);
    files.set(id, pending);
    pending.catch(() => files.delete(id));
  }
  return pending;
}
export function StoredPdfPanel({
  resourceId,
  paneId,
  active,
  onFileOpen,
}: {
  resourceId: string;
  paneId: string;
  active: boolean;
  onFileOpen: (file: File) => void;
}) {
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFile(undefined);
    setError('');
    read(resourceId)
      .then((incoming) => {
        if (!cancelled) setFile(incoming);
      })
      .catch(() => {
        if (!cancelled) setError('Non riesco ad aprire questo PDF.');
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId, attempt]);
  if (error)
    return (
      <div className="study-pane-empty" role="alert">
        <p>{error}</p>
        <button
          className="study-button study-button-secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Riprova
        </button>
      </div>
    );
  if (!file)
    return (
      <div className="study-editor-loading" role="status">
        Apertura del PDF…
      </div>
    );
  return (
    <PdfReaderPage
      file={file}
      resourceId={resourceId}
      paneId={paneId}
      active={active}
      onFileOpen={onFileOpen}
    />
  );
}
