import { useEffect, useState } from 'react';
import { OPS, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import type { Size } from '@whiteboard/model/types';
import {
  mayHaveDoubledMathGlyph,
  pdfMathGlyphRepairs,
  pdfTextRuns,
  type PdfTextRun,
} from '../lib/pdfSelectionText';

export function usePdfPage(document: PDFDocumentProxy, number: number) {
  const [state, setState] = useState<{
    number: number;
    page: PDFPageProxy | null;
    size: Size;
    text: string;
    textRuns: PdfTextRun[];
    error: string | null;
  }>({
    number,
    page: null,
    size: { width: 595, height: 842 },
    text: '',
    textRuns: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({
      ...previous,
      number,
      page: null,
      text: '',
      textRuns: [],
      error: null,
    }));
    void document
      .getPage(number)
      .then(async (page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setState({
          number,
          page,
          size: { width: viewport.width, height: viewport.height },
          text: '',
          textRuns: [],
          error: null,
        });
        // Text extraction is optional: an image-only PDF can still be rendered and annotated.
        try {
          const content = await page.getTextContent();
          const needsGlyphCheck = content.items.some(
            (item) => 'str' in item && mayHaveDoubledMathGlyph.test(item.str),
          );
          const operators = needsGlyphCheck
            ? await page.getOperatorList().catch(() => undefined)
            : undefined;
          if (!cancelled)
            setState((previous) => ({
              ...previous,
              text: content.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' '),
              textRuns: pdfTextRuns(
                content,
                viewport,
                operators && pdfMathGlyphRepairs(operators, OPS),
              ),
            }));
        } catch {
          /* Keep the rendered page available. */
        }
      })
      .catch(() => {
        if (!cancelled)
          setState((previous) => ({
            ...previous,
            error: 'Impossibile leggere questa pagina.',
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [document, number]);

  return state.number === number
    ? state
    : { ...state, page: null, text: '', textRuns: [], error: null };
}
