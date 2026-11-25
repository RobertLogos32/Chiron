import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, FileText } from 'lucide-react';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { retrieveFile } from '../services/libraryStorage';
import { displayStudyColor, type StudyResource } from '../model/library';

export function ResourcePreview({ resource }: { resource: StudyResource }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (resource.kind !== 'pdf') return;
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | undefined;
    let rendering: RenderTask | undefined;
    void (async () => {
      try {
        const file = await retrieveFile(resource.id);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        const { loadPdf } = await import('../../reader/services/pdfEngine');
        if (cancelled) return;
        loading = loadPdf(bytes);
        // Protected documents are opened by the reader's password dialog.
        loading.onPassword = () => {
          void loading?.destroy().catch(() => {});
        };
        const document = await loading.promise;
        if (cancelled) return;
        const page = await document.getPage(1);
        if (cancelled || !canvas.current) return;
        const viewport = page.getViewport({
          scale: 328 / page.getViewport({ scale: 1 }).width,
        });
        const target = canvas.current;
        target.width = viewport.width;
        target.height = viewport.height;
        rendering = page.render({ canvas: target, viewport });
        await rendering.promise;
        if (!cancelled) setReady(true);
      } catch {
        /* A readable file card remains available when no preview can be rendered. */
      } finally {
        if (loading) void loading.destroy().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      rendering?.cancel();
      if (loading) void loading.destroy().catch(() => {});
    };
  }, [resource.id, resource.kind]);

  return resource.kind === 'notebook' ? (
    <div
      className="study-cover study-notebook-cover"
      style={{ '--cover-accent': displayStudyColor(resource.color) } as CSSProperties}
    >
      <span className="study-notebook-spine" />
      <BookOpen
        size={21}
        strokeWidth={1.4}
        className="study-cover-icon"
        aria-hidden="true"
      />
      <span className="study-cover-title">{resource.name}</span>
      <span className="study-cover-footer">Quaderno</span>
      <span className="study-notebook-elastic" />
    </div>
  ) : (
    <div className="study-cover study-pdf-cover">
      <canvas ref={canvas} aria-hidden="true" style={{ opacity: ready ? 1 : 0 }} />
      {!ready && (
        <div className="study-preview-placeholder">
          <FileText size={32} strokeWidth={1} />
          <span>{resource.name.replace(/\.pdf$/i, '')}</span>
        </div>
      )}
      <span className="study-pdf-badge">PDF</span>
    </div>
  );
}
