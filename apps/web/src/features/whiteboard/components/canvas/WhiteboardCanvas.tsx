import type { RefObject } from 'react';
import { Layer, Stage } from 'react-konva';
import type Konva from 'konva';
import type {
  Bounds,
  Camera,
  Note,
  Pattern,
  Point,
  Size,
  Stroke,
  TextNote,
  Theme,
  Tool,
} from '../../model/types';
import { Ink } from './Ink';
import { SelectionOverlay } from './SelectionOverlay';
import { TextEditor, type TextEditorController } from './TextEditor';

type CanvasScene = {
  notes: Note[];
  draft: Stroke | null;
  cursor: Point | null;
  camera: Camera;
  viewport: Size;
  tool: Tool;
  theme: Theme;
  eraserSize: number;
  onTextMove: (note: TextNote, position: Point) => void;
  isLocked: (note: Note) => boolean;
  constrainTextPosition: (position: Point, note: TextNote) => Point;
};
type CanvasSurface = {
  stageRef: RefObject<Konva.Stage | null>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (event: Konva.KonvaEventObject<PointerEvent>) => void;
  onPointerMove: (event: Konva.KonvaEventObject<PointerEvent>) => void;
  onPointerLeave: () => void;
  onWheel: (event: Konva.KonvaEventObject<WheelEvent>) => void;
};
type WhiteboardCanvasProps = {
  scene: CanvasScene;
  surface: CanvasSurface;
  editor: TextEditorController;
  pattern: Pattern;
  selection: {
    bounds: Bounds | null;
    marquee: Bounds | null;
    aiArea: Bounds | null;
    busyAreas?: Bounds[];
  };
};

export function WhiteboardCanvas({
  scene,
  surface,
  editor,
  pattern,
  selection,
}: WhiteboardCanvasProps) {
  const { camera, viewport, notes, draft, tool, theme, cursor } = scene;
  const markers = notes.filter(
    (note) => note.type === 'stroke' && note.tool === 'highlighter',
  );
  const foreground = notes.filter(
    (note) => note.type !== 'stroke' || note.tool !== 'highlighter',
  );
  const patternPeriod = pattern === 'ruled' ? 36 : pattern === 'grid' ? 32 : 24;

  return (
    <div
      ref={surface.workspaceRef}
      tabIndex={0}
      className={`workspace pattern-${pattern}`}
      aria-label="Lavagna"
      style={{
        backgroundPosition: `${camera.x}px ${camera.y}px`,
        backgroundSize: `${patternPeriod * camera.zoom}px ${patternPeriod * camera.zoom}px`,
      }}
    >
      <Stage
        ref={surface.stageRef}
        width={viewport.width}
        height={viewport.height}
        x={camera.x}
        y={camera.y}
        scaleX={camera.zoom}
        scaleY={camera.zoom}
        onPointerDown={surface.onPointerDown}
        onPointerMove={surface.onPointerMove}
        onPointerLeave={surface.onPointerLeave}
        onWheel={surface.onWheel}
      >
        <Layer>
          <Ink notes={markers} tool={tool} theme={theme} />
          {draft?.tool === 'highlighter' && (
            <Ink notes={[draft]} tool={tool} theme={theme} />
          )}
        </Layer>
        <Layer>
          <Ink
            notes={foreground}
            editingId={editor.draft?.id}
            tool={tool}
            theme={theme}
            onMove={scene.onTextMove}
            constrainTextPosition={scene.constrainTextPosition}
            isLocked={scene.isLocked}
          />
          {draft?.tool === 'pen' && <Ink notes={[draft]} tool={tool} theme={theme} />}
        </Layer>
        <SelectionOverlay {...selection} zoom={camera.zoom} theme={theme} tool={tool} />
      </Stage>
      <div
        aria-hidden="true"
        className={`board-origin-boundary${camera.x === 0 ? ' is-at-left' : ''}${camera.y === 0 ? ' is-at-top' : ''}`}
      />
      {tool === 'eraser' && cursor && (
        <div
          className="eraser-cursor"
          aria-hidden="true"
          style={{
            left: cursor.x,
            top: cursor.y,
            width: scene.eraserSize * camera.zoom,
            height: scene.eraserSize * camera.zoom,
          }}
        />
      )}
      <TextEditor editor={editor} camera={camera} theme={theme} />
    </div>
  );
}
