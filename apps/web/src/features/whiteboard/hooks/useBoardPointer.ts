import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type Konva from 'konva';
import { screenToWorld } from '../lib/geometry';
import { segmentIsLocked } from '../lib/lockedAreas';
import type {
  BoundsFor,
  Camera,
  CommitNotes,
  Note,
  Point,
  PointerGesture,
  Size,
  Tool,
} from '../model/types';
import type { useBoardSelection } from './useBoardSelection';
import type { useTextEditor } from './useTextEditor';
import { useDrawingGesture } from './useDrawingGesture';
import { useEraserGesture } from './useEraserGesture';

type PointerOptions = {
  stageRef: RefObject<Konva.Stage | null>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  notes: Note[];
  commit: CommitNotes;
  boundsFor: BoundsFor;
  tool: Tool;
  color: string;
  sizes: Record<Tool, number>;
  camera: Camera;
  setCamera: Dispatch<SetStateAction<Camera>>;
  viewport: Size;
  editor: Pick<ReturnType<typeof useTextEditor>, 'draft' | 'open'>;
  selection: Pick<ReturnType<typeof useBoardSelection>, 'begin'>;
  changeZoom: (value: (zoom: number) => number, anchor: Point) => void;
  panBy: (delta: Point) => void;
  constrainPoint?: (point: Point) => Point;
  locks?: {
    areas: import('../model/types').Bounds[];
    isLocked: (note: Note) => boolean;
    protect: (previous: Note[], next: Note[]) => Note[];
  };
};

function panGesture(
  camera: Camera,
  setCamera: PointerOptions['setCamera'],
  start: PointerEvent,
): PointerGesture {
  const origin = { x: start.clientX, y: start.clientY };
  return {
    move(_point, event) {
      setCamera((previous) => ({
        ...previous,
        x: camera.x + event.clientX - origin.x,
        y: camera.y + event.clientY - origin.y,
      }));
    },
    finish() {},
  };
}

export function useBoardPointer(options: PointerOptions) {
  const {
    stageRef,
    workspaceRef,
    notes,
    tool,
    color,
    sizes,
    camera,
    viewport,
    editor,
    selection,
  } = options;
  const drawing = useDrawingGesture(options.commit, camera.zoom);
  const eraser = useEraserGesture(
    options.commit,
    options.boundsFor,
    options.locks?.protect,
    options.locks?.isLocked,
  );
  const [cursor, setCursor] = useState<Point | null>(null);
  const active = useRef<{
    pointerId: number;
    gesture: PointerGesture;
    last: Point;
    radius: number | null;
  } | null>(null);
  const isActive = useCallback(() => active.current !== null, []);
  const clearCursor = useCallback(() => setCursor(null), []);
  const finish = useCallback(() => {
    const current = active.current;
    active.current = null;
    current?.gesture.finish();
  }, []);

  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (event.pointerId === active.current?.pointerId) finish();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', finish);
    };
  }, [finish]);

  const worldPoint = () => {
    const point = stageRef.current?.getPointerPosition();
    if (!point) return null;
    const world = screenToWorld(point, camera);
    return options.constrainPoint?.(world) ?? world;
  };

  function onPointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
    const native = event.evt;
    if (native.button !== 0 || !native.isPrimary || editor.draft || isActive()) return;
    const point = worldPoint();
    if (!point) return;
    const hitId = (event.target as Konva.Node).getAttr('noteId') as string | undefined;
    const radius =
      tool === 'eraser'
        ? sizes.eraser / 2
        : tool === 'pen' || tool === 'highlighter'
          ? sizes[tool] / 2 + 1
          : null;
    const editing = radius !== null || tool === 'text';
    if (editing && segmentIsLocked(point, point, radius ?? 0, options.locks?.areas ?? []))
      return;
    if (
      editing &&
      hitId &&
      notes.some((note) => note.id === hitId && options.locks?.isLocked(note))
    )
      return;
    // Let Konva receive its native drag events when moving an existing text.
    if (tool === 'hand' && hitId) return;
    native.preventDefault();
    workspaceRef.current?.focus({ preventScroll: true });
    if (tool === 'text') {
      editor.open(point, hitId, color, sizes.text, viewport);
      return;
    }

    let gesture: PointerGesture;
    switch (tool) {
      case 'hand':
        gesture = panGesture(camera, options.setCamera, native);
        break;
      case 'select':
      case 'ai':
        gesture = selection.begin({
          point,
          mode: tool,
          hitId,
          append: native.shiftKey,
          tolerance: 3 / camera.zoom,
        });
        break;
      case 'eraser':
        gesture = eraser.begin(point, notes, sizes.eraser / 2);
        setCursor(stageRef.current!.getPointerPosition());
        break;
      default:
        gesture = drawing.begin(point, tool, color, sizes[tool]);
    }
    active.current = { pointerId: native.pointerId, gesture, last: point, radius };
    if (native.target instanceof Element)
      native.target.setPointerCapture(native.pointerId);
  }

  function onPointerMove(event: Konva.KonvaEventObject<PointerEvent>) {
    if (tool === 'eraser') setCursor(stageRef.current?.getPointerPosition() ?? null);
    const current = active.current;
    if (!current || current.pointerId !== event.evt.pointerId) return;
    const point = worldPoint();
    if (!point) return;
    if (
      current.radius !== null &&
      segmentIsLocked(current.last, point, current.radius, options.locks?.areas ?? [])
    ) {
      finish();
      return;
    }
    current.gesture.move(point, event.evt);
    current.last = point;
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    const native = event.evt;
    native.preventDefault();
    if (editor.draft || isActive()) return;
    if (native.ctrlKey || native.metaKey) {
      const rect = workspaceRef.current!.getBoundingClientRect();
      options.changeZoom((zoom) => zoom * Math.exp(-native.deltaY * 0.005), {
        x: native.clientX - rect.left,
        y: native.clientY - rect.top,
      });
    } else {
      options.panBy({ x: -native.deltaX, y: -native.deltaY });
    }
  }

  return {
    draft: drawing.draft,
    erasing: eraser.preview,
    cursor,
    clearCursor,
    isActive,
    onPointerDown,
    onPointerMove,
    onPointerLeave: clearCursor,
    onWheel,
  };
}
