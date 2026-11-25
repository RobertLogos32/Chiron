import { FileText, FolderOpen } from 'lucide-react';

type EmptyStateProps = { loading: boolean; onOpen: () => void; onExample: () => void };

export function EmptyState({ loading, onOpen, onExample }: EmptyStateProps) {
  return (
    <div className="pdf-empty-state">
      <div className={`pdf-empty-symbol ${loading ? 'is-loading' : ''}`}>
        <FileText size={37} strokeWidth={1.25} />
      </div>
      <h1>{loading ? 'Apertura del documento…' : 'Apri un PDF'}</h1>
      <p>
        {loading
          ? 'Sto preparando le pagine.'
          : 'Trascinalo qui o sceglilo dal dispositivo.'}
      </p>
      {!loading && (
        <>
          <button className="pdf-primary-button" onClick={onOpen}>
            <FolderOpen size={17} />
            Scegli un documento
          </button>
          <button className="pdf-example-button" onClick={onExample}>
            Apri un esempio
          </button>
        </>
      )}
    </div>
  );
}
