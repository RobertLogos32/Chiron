import type { RefObject } from 'react';
import { Layer, Stage } from 'react-konva';
import type Konva from 'konva';
import { Ink } from '@whiteboard/components/canvas/Ink';
import { SelectionOverlay } from '@whiteboard/components/canvas/SelectionOverlay';
import { TextEditor } from '@whiteboard/components/canvas/TextEditor';
import { screenToWorld } from '@whiteboard/lib/geometry';
import type { Size, Theme } from '@whiteboard/model/types';
import type { usePdfAnnotations } from '../../annotations/hooks/usePdfAnnotations';
import type { usePdfRaster } from '../hooks/usePdfRaster';

type PdfCanvasProps = {
  canvas: RefObject<HTMLCanvasElement | null>;
  raster: ReturnType<typeof usePdfRaster>;
  hasPage: boolean;
  pageNumber: number;
  size: Size;
  text: string;
  theme: Theme;
  annotations: ReturnType<typeof usePdfAnnotations>;
};

export function PdfCanvas({
  canvas,
  raster,
  hasPage,
  pageNumber,
  size,
  text,
  theme,
  annotations: board,
}: PdfCanvasProps) {
  const { camera, viewport, tools, notes, draft, selection, cursor, editor } = board;
  const markers = notes.filter(
    (note) => note.type === 'stroke' && note.tool === 'highlighter',
  );
  const ink = notes.filter(
    (note) => note.type !== 'stroke' || note.tool !== 'highlighter',
  );
  const clip = { clipX: 0, clipY: 0, clipWidth: size.width, clipHeight: size.height };

  function onPointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
    if (!hasPage) return;
    const screen = board.stageRef.current?.getPointerPosition();
    if (!screen) return;
    const point = screenToWorld(screen, camera);
    const drawing = ['pen', 'highlighter', 'text', 'eraser'].includes(tools.tool);
    if (
      drawing &&
      (point.x < 0 || point.y < 0 || point.x > size.width || point.y > size.height)
    )
      return;
    board.pointer.onPointerDown(event);
  }

  return (
    <div
      ref={board.workspaceRef}
      tabIndex={0}
      className="workspace pdf-workspace"
      aria-label="Documento PDF e annotazioni"
    >
      <div
        className="pdf-paper"
        style={{
          left: camera.x,
          top: camera.y,
          width: size.width * camera.zoom,
          height: size.height * camera.zoom,
        }}
      >
        <canvas
          ref={canvas}
          aria-label={`Pagina PDF ${pageNumber}`}
          style={{ opacity: raster.ready ? 1 : 0 }}
        />
      </div>
      <div className="sr-only">{text}</div>
      <Stage
        ref={board.stageRef}
        width={viewport.width}
        height={viewport.height}
        x={camera.x}
        y={camera.y}
        scaleX={camera.zoom}
        scaleY={camera.zoom}
        onPointerDown={onPointerDown}
        onPointerMove={board.pointer.onPointerMove}
        onPointerLeave={board.pointer.onPointerLeave}
        onWheel={board.pointer.onWheel}
      >
        <Layer {...clip} name="capture-ink">
          <Ink notes={markers} tool={tools.tool} theme="light" />
          {draft?.tool === 'highlighter' && (
            <Ink notes={[draft]} tool={tools.tool} theme="light" />
          )}
        </Layer>
        <Layer {...clip} name="capture-ink">
          <Ink
            notes={ink}
            tool={tools.tool}
            theme="light"
            editingId={editor.draft?.id}
            onMove={board.moveText}
            isLocked={board.locks.isLocked}
            constrainTextPosition={board.constrainTextPosition}
          />
          {draft?.tool === 'pen' && (
            <Ink notes={[draft]} tool={tools.tool} theme="light" />
          )}
        </Layer>
        <SelectionOverlay
          bounds={selection.bounds}
          aiArea={selection.aiArea}
          busyAreas={selection.busyAreas}
          marquee={selection.marquee}
          zoom={camera.zoom}
          theme={theme}
          tool={tools.tool}
        />
      </Stage>
      {tools.tool === 'eraser' && cursor && (
        <div
          className="eraser-cursor"
          aria-hidden="true"
          style={{
            left: cursor.x,
            top: cursor.y,
            width: tools.sizes.eraser * camera.zoom,
            height: tools.sizes.eraser * camera.zoom,
          }}
        />
      )}
      <TextEditor editor={editor} camera={camera} theme="light" />
      {(raster.loading || !hasPage) && (
        <div className="pdf-render-status" role="status">
          Caricamento pagina…
        </div>
      )}
      {raster.error && (
        <div className="pdf-error" role="alert">
          {raster.error}
        </div>
      )}
    </div>
  );
}
