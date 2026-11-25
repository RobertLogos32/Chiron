import { useRef } from 'react';
import type Konva from 'konva';
import { useElementSize } from '@shared/hooks/useElementSize';
import { useBoardPointer } from '@whiteboard/hooks/useBoardPointer';
import { useBoardSelection } from '@whiteboard/hooks/useBoardSelection';
import { useBoardShortcuts } from '@whiteboard/hooks/useBoardShortcuts';
import { useMeasuredBounds } from '@whiteboard/hooks/useMeasuredBounds';
import { useTextEditor } from '@whiteboard/hooks/useTextEditor';
import { useDrawingTools } from '@whiteboard/hooks/useDrawingTools';
import type { Point, Size, TextNote, Tool, Theme } from '@whiteboard/model/types';
import { usePdfCamera } from '../../reader/hooks/usePdfCamera';
import { usePageAnnotations } from './usePageAnnotations';
import { useAiScope, useAiSurface } from '@whiteboard/hooks/useAiRequests';
import { useLockedAreas } from '@whiteboard/hooks/useLockedAreas';
import { revealAiCamera } from '@whiteboard/lib/aiNavigation';

export function usePdfAnnotations(
  id: string,
  pageNumber: number,
  pageSize: Size,
  tools: ReturnType<typeof useDrawingTools>,
  active = true,
  theme: Theme = 'dark',
  resourceId?: string,
  ready = true,
  paneId?: string,
) {
  const stageRef = useRef<Konva.Stage>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(workspaceRef);
  const view = usePdfCamera(pageSize, viewport, pageNumber);
  const boundsFor = useMeasuredBounds(stageRef);
  const lockScope = `pdf:${id}:${pageNumber}`;
  const scope = paneId ? `${lockScope}:pane:${paneId}` : lockScope;
  const ai = useAiScope(scope, lockScope);
  const locks = useLockedAreas(ai.areas, boundsFor);
  const history = usePageAnnotations(id, pageNumber, locks.protect);
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
    theme,
    context: 'pdf',
    target: resourceId
      ? { kind: 'pdf', resourceId, page: pageNumber, pageHeight: pageSize.height, paneId }
      : undefined,
    ready: ready && viewport.width > 1 && viewport.height > 1,
    reveal: (area) => {
      editor.save();
      view.setCamera((previous) => revealAiCamera(area, previous, viewport));
      workspaceRef.current?.focus({ preventScroll: true });
    },
  });
  const pointer = useBoardPointer({
    stageRef,
    workspaceRef,
    viewport,
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
    editor,
    selection,
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
    if (!pointer.isActive() && !editor.draft) view.changeZoom(value, anchor);
  }
  function moveText(note: TextNote, position: Point) {
    const x = Math.max(0, Math.min(pageSize.width - 40, position.x));
    const y = Math.max(0, Math.min(pageSize.height - 40, position.y));
    history.commit((notes) =>
      notes.map((item) => (item.id === note.id ? { ...note, x, y } : item)),
    );
  }
  function constrainTextPosition(position: Point, note: TextNote) {
    const point = {
      x: Math.max(0, Math.min(pageSize.width - 40, position.x)),
      y: Math.max(0, Math.min(pageSize.height - 40, position.y)),
    };
    return locks.blocksText({ ...note, ...point }) ? { x: note.x, y: note.y } : point;
  }
  function closeAi() {
    selection.closeAi();
    workspaceRef.current?.focus();
  }
  function preparePageChange() {
    editor.save();
    closeOverlays();
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
    },
    active,
  );

  return {
    camera: view.camera,
    viewport,
    fit: view.fit,
    changeZoom,
    tools: { ...tools, selectTool },
    history: { canUndo: history.canUndo, canRedo: history.canRedo, undo, redo },
    notes: pointer.erasing ?? history.notes,
    draft: pointer.draft,
    cursor: pointer.cursor,
    editor,
    selection: { ...selection, busyAreas: ai.areas },
    ai,
    locks,
    stageRef,
    workspaceRef,
    pointer,
    moveText,
    constrainTextPosition,
    closeAi,
    preparePageChange,
    saveError: history.saveError,
  };
}
