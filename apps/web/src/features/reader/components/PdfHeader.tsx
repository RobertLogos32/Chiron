import { FileText, FolderOpen, ScanLine } from 'lucide-react';
import { ZoomControls } from '@whiteboard/components/settings/ZoomControls';
import { PageNavigation } from './PageNavigation';

type PdfHeaderProps = {
  name?: string;
  onOpen: () => void;
  navigation?: { page: number; count: number; onChange: (page: number) => void };
  view?: {
    zoom: number;
    onZoom: (value: number | ((zoom: number) => number)) => void;
    onFit: () => void;
  };
};

export function PdfHeader({ name, onOpen, navigation, view }: PdfHeaderProps) {
  return (
    <header className="pdf-header">
      <div className="pdf-file-controls">
        <button className="pdf-open-button" onClick={onOpen}>
          <FolderOpen size={16} />
          <span>Apri PDF</span>
        </button>
        {name && (
          <span className="pdf-file-name" title={name}>
            <FileText size={15} />
            <span>{name}</span>
          </span>
        )}
      </div>
      <div className="pdf-navigation-slot">
        {navigation && <PageNavigation {...navigation} />}
      </div>
      <div className="pdf-view-controls">
        {view && (
          <>
            <button
              className="pdf-fit-button"
              aria-label="Adatta pagina"
              title="Adatta pagina"
              onClick={view.onFit}
            >
              <ScanLine size={17} />
            </button>
            <ZoomControls zoom={view.zoom} onChange={view.onZoom} />
          </>
        )}
      </div>
    </header>
  );
}
