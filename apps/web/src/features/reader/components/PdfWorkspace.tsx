import { useEffect, useRef, useState } from 'react';
import { WhiteboardToolbar } from '@whiteboard/components/toolbar/WhiteboardToolbar';
import { AiPrompt } from '@whiteboard/components/ai/AiPrompt';
import type { useDrawingTools } from '@whiteboard/hooks/useDrawingTools';
import type { Theme } from '@whiteboard/model/types';
import { usePdfAnnotations } from '../../annotations/hooks/usePdfAnnotations';
import { usePdfPage } from '../hooks/usePdfPage';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { boundedPage } from '../lib/pageCamera';
import {
  hasPdfFractionBar,
  pdfGlyphsWithinSelection,
  selectedPdfText,
} from '../lib/pdfSelectionText';
import type { LoadedPdf } from '../model/types';
import { PdfCanvas } from './PdfCanvas';
import { PdfHeader } from './PdfHeader';
import { useAiRequests } from '@whiteboard/hooks/useAiRequests';
import { captureAiSelection } from '@whiteboard/lib/captureAiSelection';
import { usePdfRaster } from '../hooks/usePdfRaster';
import { pdfImageBounds } from '../../annotations/lib/pdfWriteSpace';

type PdfWorkspaceProps = {
  source: LoadedPdf;
  tools: ReturnType<typeof useDrawingTools>;
  theme: Theme;
  onOpen: () => void;
  active?: boolean;
  resourceId?: string;
  paneId?: string;
};

export function PdfWorkspace({
  source,
  tools,
  theme,
  onOpen,
  active = true,
  resourceId,
  paneId,
}: PdfWorkspaceProps) {
  const [number, setNumber] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const page = usePdfPage(source.document, number);
  const { navigation } = useAiRequests();
  const annotations = usePdfAnnotations(
    source.id,
    number,
    page.size,
    tools,
    active,
    theme,
    resourceId,
    page.page?.pageNumber === number,
    paneId,
    getPageContent,
  );
  const raster = usePdfRaster(canvas, page.page, annotations.camera.zoom);
  useEffect(() => {
    if (
      navigation?.target?.kind === 'pdf' &&
      navigation.target.resourceId === resourceId &&
      (!navigation.target.paneId || navigation.target.paneId === paneId) &&
      navigation.target.page
    ) {
      changePage(navigation.target.page);
    }
  }, [navigation?.jobId, resourceId, paneId]);

  function getPageContent() {
    if (!canvas.current || !raster.ready || page.page?.pageNumber !== number) return null;
    return {
      canvas: canvas.current,
      obstacles: [
        ...page.textRuns.map(({ bounds }) => bounds),
        ...pdfImageBounds(page.page.imageCoordinates ?? [], page.size),
      ],
    };
  }

  function changePage(value: number) {
    const next = boundedPage(value, source.document.numPages);
    if (annotations.pointer.isActive() || next === number) return;
    annotations.preparePageChange();
    setNumber(next);
  }

  function fitPage() {
    if (annotations.pointer.isActive()) return;
    annotations.editor.save();
    annotations.fit();
  }

  usePageShortcuts((delta) => changePage(number + delta), active);

  return (
    <>
      <PdfCanvas
        canvas={canvas}
        raster={raster}
        hasPage={page.page?.pageNumber === number}
        pageNumber={number}
        size={page.size}
        text={page.text}
        theme={theme}
        annotations={annotations}
      />
      <PdfHeader
        name={source.name}
        onOpen={onOpen}
        navigation={{
          page: number,
          count: source.document.numPages,
          onChange: changePage,
        }}
        view={{
          zoom: annotations.camera.zoom,
          onZoom: annotations.changeZoom,
          onFit: fitPage,
        }}
      />
      {active && (
        <WhiteboardToolbar
          tools={annotations.tools}
          theme={theme}
          selection={annotations.selection}
          colorTheme="light"
          history={annotations.history}
        />
      )}
      {annotations.selection.aiArea && (
        <AiPrompt
          area={annotations.selection.aiArea}
          camera={annotations.camera}
          anchor={annotations.workspaceRef}
          theme={theme}
          active={active}
          context="pdf"
          onClose={annotations.closeAi}
          onSend={({ selection, prompt }) => {
            const pdf = canvas.current;
            if (!pdf || !raster.ready || page.page?.pageNumber !== number) {
              throw new Error('PDF page is not ready');
            }
            const capture = captureAiSelection(
              annotations.stageRef.current,
              annotations.workspaceRef.current,
              selection,
              annotations.camera,
              { pdf, size: page.size },
            );
            const pdfText = selectedPdfText(
              page.textRuns,
              capture.area,
              (area) => hasPdfFractionBar(pdf, page.size, area),
              (bounds) => pdfGlyphsWithinSelection(pdf, page.size, bounds, capture.area),
            );
            annotations.ai.submit(capture.area, prompt, {
              ...capture,
              source: pdfText ? { pdf_text: pdfText } : undefined,
            });
          }}
        />
      )}
      {page.error && (
        <div className="pdf-error" role="alert">
          {page.error}
        </div>
      )}
      {annotations.saveError && (
        <div className="save-error" role="alert">
          Non riesco a salvare gli appunti nel browser. Controlla lo spazio disponibile.
        </div>
      )}
    </>
  );
}
