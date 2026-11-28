import { useEffect, useState, type RefObject } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

export function usePdfRaster(
  ref: RefObject<HTMLCanvasElement | null>,
  page: PDFPageProxy | null,
  zoom: number,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedPage, setRenderedPage] = useState<PDFPageProxy | null>(null);

  useEffect(() => {
    if (!page || !ref.current) return;
    let cancelled = false;
    const base = page.getViewport({ scale: zoom });
    const density = Math.max(
      0.25,
      Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(16_000_000 / (base.width * base.height)),
      ),
    );
    const viewport = page.getViewport({ scale: zoom * density });
    // Each render owns its canvas, so quick page/zoom changes cannot race over one surface.
    const buffer = document.createElement('canvas');
    buffer.width = Math.max(1, Math.ceil(viewport.width));
    buffer.height = Math.max(1, Math.ceil(viewport.height));
    setLoading(true);
    setError(null);
    const task = page.render({
      canvas: buffer,
      viewport,
      recordImages: true,
    });
    void task.promise
      .then(() => {
        if (cancelled || !ref.current) return;
        const output = ref.current;
        output.width = buffer.width;
        output.height = buffer.height;
        output.getContext('2d')!.drawImage(buffer, 0, 0);
        setRenderedPage(page);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Impossibile visualizzare questa pagina.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [ref, page, zoom]);

  return { loading, error, ready: !!page && renderedPage === page };
}
