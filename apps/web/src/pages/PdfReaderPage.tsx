import { useEffect, useRef } from 'react';
import { FileUp, X } from 'lucide-react';
import { useBoardAppearance } from '@whiteboard/hooks/useBoardAppearance';
import { useDrawingTools } from '@whiteboard/hooks/useDrawingTools';
import { usePdfDocument } from '../features/reader/hooks/usePdfDocument';
import { useFileDrop } from '../features/reader/hooks/useFileDrop';
import { EmptyState } from '../features/reader/components/EmptyState';
import { InactiveToolbar } from '../features/reader/components/InactiveToolbar';
import { PasswordDialog } from '../features/reader/components/PasswordDialog';
import { PdfHeader } from '../features/reader/components/PdfHeader';
import { PdfWorkspace } from '../features/reader/components/PdfWorkspace';

export function PdfReaderPage({
  file,
  active = true,
  onFileOpen,
  resourceId,
  paneId,
}: {
  file?: File;
  active?: boolean;
  onFileOpen?: (file: File) => void;
  resourceId?: string;
  paneId?: string;
} = {}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const reader = usePdfDocument();
  const appearance = useBoardAppearance();
  const tools = useDrawingTools();
  const openFile = onFileOpen ?? reader.openFile;
  const drop = useFileDrop(openFile);
  const openPicker = () => fileInput.current?.click();
  const loadFile = reader.openFile;

  useEffect(() => {
    if (file) loadFile(file);
  }, [file, loadFile]);

  return (
    <main
      className={`whiteboard pdf-viewer theme-${appearance.theme} tool-${tools.tool}`}
      {...drop.handlers}
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="pdf-file-input"
        tabIndex={-1}
        aria-label="Scegli file PDF"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) openFile(file);
          event.currentTarget.value = '';
        }}
      />
      {reader.source ? (
        <PdfWorkspace
          key={reader.source.instance}
          source={reader.source}
          tools={tools}
          theme={appearance.theme}
          onOpen={openPicker}
          active={active}
          resourceId={resourceId}
          paneId={paneId}
        />
      ) : (
        <>
          <PdfHeader onOpen={openPicker} />
          <EmptyState
            loading={reader.loading}
            onOpen={openPicker}
            onExample={reader.openExample}
          />
          {active && <InactiveToolbar tools={tools} theme={appearance.theme} />}
        </>
      )}
      {reader.error && (
        <div className="pdf-error" role="alert">
          <span>{reader.error}</span>
          <button aria-label="Chiudi avviso" onClick={reader.dismissError}>
            <X size={16} />
          </button>
        </div>
      )}
      {drop.dragging && (
        <div className="pdf-drop-target">
          <FileUp size={32} />
          <span>Rilascia il PDF per aprirlo</span>
        </div>
      )}
      {reader.password && (
        <PasswordDialog request={reader.password} onCancel={reader.close} />
      )}
    </main>
  );
}
