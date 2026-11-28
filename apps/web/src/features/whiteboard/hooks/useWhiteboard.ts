import { useRef } from 'react';
import type Konva from 'konva';
import { useElementSize } from '../../../shared/hooks/useElementSize';
import { MIN_BOARD_TEXT_WIDTH } from '../config/defaults';
import type {
  BoardWritePlacement,
  Bounds,
  Note,
  Point,
  TextNote,
  Tool,
} from '../model/types';
import { clampBoardPoint } from '../lib/boardBounds';
import { boardWriteSpaces } from '../lib/boardWritePlacement';
import {
  fitWriteBlock,
  minimumTextWidth,
  MIN_VISUAL_SCALE,
  textSize,
} from '../lib/fitWriteBlock';
import { protectLockedNotes } from '../lib/lockedAreas';
import { useBoardHistory } from './useBoardHistory';
import { useBoardAppearance } from './useBoardAppearance';
import { useBoardCamera } from './useBoardCamera';
import { useBoardPersistence } from './useBoardPersistence';
import { useDrawingTools } from './useDrawingTools';
import { useTextEditor } from './useTextEditor';
import { useMeasuredBounds } from './useMeasuredBounds';
import { useBoardSelection } from './useBoardSelection';
import { useBoardPointer } from './useBoardPointer';
import { useBoardShortcuts } from './useBoardShortcuts';
import { useAiScope, useAiSurface } from './useAiRequests';
import { useLockedAreas } from './useLockedAreas';
import { revealAiCamera } from '../lib/aiNavigation';

export function useWhiteboard({
  documentId,
  active = true,
  paneId,
}: { documentId?: string; active?: boolean; paneId?: string } = {}) {
  const stageRef = useRef<Konva.Stage>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(workspaceRef);
  const appearance = useBoardAppearance();
  const view = useBoardCamera(viewport, documentId);
  const tools = useDrawingTools();
  const boundsFor = useMeasuredBounds(stageRef);
  const lockScope = `notebook:${documentId ?? 'default'}`;
  const scope = paneId ? `${lockScope}:pane:${paneId}` : lockScope;
  const ai = useAiScope(scope, lockScope);
  const locks = useLockedAreas(ai.areas, boundsFor);
  const history = useBoardHistory(documentId, locks.protect);
  const selection = useBoardSelection(history.notes, history.commit, boundsFor);
  const editor = useTextEditor(
    history.notes,
    history.commit,
    view.camera,
    locks.blocksText,
  );
  useAiSurface(scope, {
    anchor: workspaceRef,
    camera: view.camera,
    theme: appearance.theme,
    context: 'notebook',
    target: documentId ? { kind: 'notebook', resourceId: documentId, paneId } : undefined,
    ready: viewport.width > 1 && viewport.height > 1,
    write: writeOnBoard,
    reveal: (area) => {
      editor.save();
      view.setCamera((previous) => revealAiCamera(area, previous, viewport));
      workspaceRef.current?.focus({ preventScroll: true });
    },
  });
  const saveError = useBoardPersistence(
    history.notes,
    view.camera,
    documentId,
    history.getNotes,
  );
  const pointer = useBoardPointer({
    stageRef,
    workspaceRef,
    notes: history.notes,
    commit: history.commit,
    boundsFor,
    tool: tools.tool,
    color: tools.color,
    sizes: tools.sizes,
    camera: view.camera,
    setCamera: view.setCamera,
    changeZoom: view.changeZoom,
    panBy: view.panBy,
    viewport,
    editor,
    selection,
    constrainPoint: clampBoardPoint,
    locks,
  });

  function closeOverlays() {
    selection.clear();
    tools.setSizeOpen(false);
    pointer.clearCursor();
  }

  function selectTool(tool: Tool) {
    editor.save();
    tools.setTool(tool);
    closeOverlays();
  }

  function undo() {
    selection.clearSelected();
    history.undo();
  }

  function redo() {
    selection.clearSelected();
    history.redo();
  }

  function changeZoom(value: number | ((zoom: number) => number), anchor?: Point) {
    if (pointer.isActive() || editor.draft) return;
    view.changeZoom(value, anchor);
  }

  function moveText(note: TextNote, position: Point) {
    history.commit((notes) =>
      notes.map((current) =>
        current.id === note.id ? { ...note, ...clampBoardPoint(position) } : current,
      ),
    );
  }

  function constrainTextPosition(position: Point, note: TextNote) {
    const point = clampBoardPoint(position);
    return locks.blocksText({ ...note, ...point }) ? { x: note.x, y: note.y } : point;
  }

  function writeOnBoard(
    notes: TextNote[],
    area: Bounds,
    otherLockedAreas: Bounds[],
    placement?: BoardWritePlacement,
  ): Bounds | null {
    const exactBounds = (note: Note): Bounds => {
      if (note.type === 'text') return { x: note.x, y: note.y, ...textSize(note) };
      const stage = stageRef.current;
      return (
        stage?.findOne(`#note-${note.id}`)?.getClientRect({ relativeTo: stage }) ??
        boundsFor(note)
      );
    };
    const minimum = {
      width: Math.max(
        ...notes.map((note) =>
          note.visual
            ? note.visual.width * MIN_VISUAL_SCALE
            : (note.latex?.width ??
              Math.max(MIN_BOARD_TEXT_WIDTH, minimumTextWidth(note))),
        ),
      ),
      height:
        notes.reduce(
          (sum, note) =>
            sum +
            (note.visual
              ? note.visual.height * MIN_VISUAL_SCALE
              : (note.latex?.height ?? note.fontSize * 1.5)),
          0,
        ) +
        (notes.length - 1) * 12,
    };
    let written: Bounds | null = null;
    history.commit(
      (current) => {
        const occupied = current.map(exactBounds);
        if (editor.draft) occupied.push(exactBounds({ ...editor.draft, type: 'text' }));
        if (pointer.draft) occupied.push(boundsFor(pointer.draft));
        const spaces = boardWriteSpaces(
          area,
          [...occupied, ...otherLockedAreas],
          minimum,
          placement,
        );
        for (const space of spaces) {
          const block = fitWriteBlock(notes, space);
          if (!block) continue;
          written = block.bounds;
          return [...current, ...block.notes];
        }
        return current;
      },
      (previous, next) =>
        protectLockedNotes(previous, next, otherLockedAreas, exactBounds),
    );
    return written;
  }

  function closeAi() {
    selection.closeAi();
    workspaceRef.current?.focus();
  }

  useBoardShortcuts(
    {
      tool: tools.tool,
      isInteracting: pointer.isActive,
      hasSelection: selection.selected.length > 0,
      closeOverlays,
      deleteSelection: selection.deleteSelected,
      selectAll: selection.selectAll,
      selectTool,
      undo,
      redo,
      changeZoom,
      cancelAiRequest: ai.cancelSelected,
    },
    active,
  );

  return {
    scene: {
      notes: pointer.erasing ?? history.notes,
      draft: pointer.draft,
      cursor: pointer.cursor,
      camera: view.camera,
      viewport,
      tool: tools.tool,
      theme: appearance.theme,
      eraserSize: tools.sizes.eraser,
      onTextMove: moveText,
      isLocked: locks.isLocked,
      constrainTextPosition,
    },
    surface: {
      stageRef,
      workspaceRef,
      onPointerDown: pointer.onPointerDown,
      onPointerMove: pointer.onPointerMove,
      onPointerLeave: pointer.onPointerLeave,
      onWheel: pointer.onWheel,
    },
    appearance,
    tools: { ...tools, selectTool },
    history: { canUndo: history.canUndo, canRedo: history.canRedo, undo, redo },
    selection: { ...selection, busyAreas: ai.areas },
    ai,
    editor,
    changeZoom,
    closeAi,
    saveError,
  };
}
