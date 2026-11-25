import type { StudyResource } from './library';

export type WorkspacePane = {
  id: string;
  kind: 'pdf' | 'notebook' | 'chat';
  resourceId?: string;
  weight: number;
};
export type WorkspaceState = {
  subjectId: string;
  panes: WorkspacePane[];
  activeId: string;
};
export type OpenPaneOptions = { paneId?: string; afterId?: string };

export function insertPane(
  state: WorkspaceState,
  pane: WorkspacePane,
  afterId?: string,
): WorkspaceState {
  if (state.panes.some((item) => item.id === pane.id))
    return { ...state, activeId: pane.id };
  const index = state.panes.findIndex((item) => item.id === afterId);
  const panes = [...state.panes];
  const average =
    panes.reduce((sum, item) => sum + item.weight, 0) / Math.max(1, panes.length);
  panes.splice(index < 0 ? panes.length : index + 1, 0, {
    ...pane,
    weight: average || 1,
  });
  return { ...state, panes, activeId: pane.id };
}

export function openResourcePane(
  previous: WorkspaceState | null,
  resource: StudyResource,
  options: OpenPaneOptions = {},
): WorkspaceState {
  const state: WorkspaceState =
    previous?.subjectId === resource.subjectId
      ? previous
      : { subjectId: resource.subjectId, panes: [], activeId: '' };
  const existing =
    !options.afterId && !options.paneId
      ? state.panes.find(
          (pane) => pane.resourceId === resource.id && pane.kind === resource.kind,
        )
      : undefined;
  if (existing) return { ...state, activeId: existing.id };
  const targetId = options.paneId ?? (!options.afterId ? state.activeId : undefined);
  if (targetId && state.panes.some((pane) => pane.id === targetId)) {
    return {
      ...state,
      activeId: targetId,
      panes: state.panes.map((pane) =>
        pane.id === targetId
          ? { ...pane, kind: resource.kind, resourceId: resource.id }
          : pane,
      ),
    };
  }
  return insertPane(
    state,
    {
      id: options.paneId ?? crypto.randomUUID(),
      kind: resource.kind,
      resourceId: resource.id,
      weight: 1,
    },
    options.afterId,
  );
}

export function closePane(state: WorkspaceState, id: string): WorkspaceState | null {
  const index = state.panes.findIndex((pane) => pane.id === id);
  const panes = state.panes.filter((pane) => pane.id !== id);
  if (!panes.length) return null;
  return {
    ...state,
    panes,
    activeId: state.activeId === id ? panes[Math.max(0, index - 1)].id : state.activeId,
  };
}

export function reorderPane(
  state: WorkspaceState,
  sourceId: string,
  targetId: string,
  side: 'before' | 'after',
): WorkspaceState {
  const source = state.panes.find((pane) => pane.id === sourceId);
  if (
    !source ||
    sourceId === targetId ||
    !state.panes.some((pane) => pane.id === targetId)
  )
    return state;
  const panes = state.panes.filter((pane) => pane.id !== sourceId);
  const index = panes.findIndex((pane) => pane.id === targetId);
  panes.splice(index + (side === 'after' ? 1 : 0), 0, source);
  return panes.every((pane, position) => pane === state.panes[position])
    ? state
    : { ...state, panes };
}

export function resizePanes(
  state: WorkspaceState,
  leftId: string,
  rightId: string,
  fraction: number,
): WorkspaceState {
  const left = state.panes.find((pane) => pane.id === leftId);
  const right = state.panes.find((pane) => pane.id === rightId);
  if (!left || !right || !Number.isFinite(fraction)) return state;
  const total = left.weight + right.weight;
  const next = Math.max(0.15, Math.min(0.85, fraction)) * total;
  return {
    ...state,
    panes: state.panes.map((pane) =>
      pane.id === leftId
        ? { ...pane, weight: next }
        : pane.id === rightId
          ? { ...pane, weight: total - next }
          : pane,
    ),
  };
}
