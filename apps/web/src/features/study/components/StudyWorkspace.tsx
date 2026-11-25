import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, GripVertical, SquarePen, X } from 'lucide-react';
import type { StudyResource, Subject } from '../model/library';
import type { OpenPaneOptions, WorkspacePane, WorkspaceState } from '../model/workspace';
import { PanelPicker } from './PanelPicker';
import { ResourceSwitcher } from './ResourceSwitcher';
import { StudyChat } from './StudyChat';
import { usePaneReorder } from '../hooks/usePaneReorder';
export type { WorkspaceState } from '../model/workspace';

const WhiteboardPage = lazy(() =>
  import('../../../pages/WhiteboardPage').then((module) => ({
    default: module.WhiteboardPage,
  })),
);
const StoredPdfPanel = lazy(() =>
  import('./StoredPdfPanel').then((module) => ({ default: module.StoredPdfPanel })),
);

type WorkspaceProps = {
  state: WorkspaceState;
  subject: Subject;
  resources: StudyResource[];
  onBack: () => void;
  suspended?: boolean;
  onActive: (id: string) => void;
  onResource: (resource: StudyResource, paneId: string) => void;
  onAddResource: (resource: StudyResource, afterId: string) => void;
  onChat: (afterId: string) => void;
  onClose: (id: string) => void;
  onResize: (leftId: string, rightId: string, fraction: number) => void;
  onReorder: (sourceId: string, targetId: string, side: 'before' | 'after') => void;
  onImport: (file?: File, options?: OpenPaneOptions) => void;
  onNotebook: (options?: OpenPaneOptions) => void;
};

export function StudyWorkspace({
  state,
  subject,
  resources,
  onBack,
  suspended = false,
  onActive,
  onResource,
  onAddResource,
  onChat,
  onClose,
  onResize,
  onReorder,
  onImport,
  onNotebook,
}: WorkspaceProps) {
  const [stacked, setStacked] = useState(
    () => window.matchMedia('(max-width: 600px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const update = () => setStacked(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const reorder = usePaneReorder({
    ids: state.panes.map((pane) => pane.id),
    stacked,
    suspended,
    onReorder,
  });
  return (
    <div
      className={`study-workspace is-multipane${state.panes.length > 1 ? ' is-split' : ''}${reorder.drag ? ' is-reordering' : ''}`}
    >
      <span id={reorder.instructionsId} className="sr-only">
        Trascina la zona dei comandi per cambiare posizione. Dalla maniglia, usa Alt e le
        frecce {stacked ? 'su o giù' : 'sinistra o destra'} per riordinare con la
        tastiera. Esc annulla il trascinamento.
      </span>
      <span className="sr-only" role="status">
        {reorder.announcement}
      </span>
      <div
        ref={reorder.root}
        className="study-workspace-panes"
        aria-label="Pannelli dello spazio di studio"
      >
        {state.panes.map((pane, index) => {
          const resource = resources.find((item) => item.id === pane.resourceId);
          const active = state.activeId === pane.id;
          const label =
            pane.kind === 'pdf'
              ? 'PDF'
              : pane.kind === 'notebook'
                ? 'lavagna'
                : 'chat AI';
          const name =
            pane.kind === 'chat'
              ? 'Chat AI'
              : (resource?.name ?? 'Materiale non disponibile');
          const backButton = index === 0 && (
            <button
              type="button"
              className="study-workspace-back"
              onClick={onBack}
              aria-label="Torna alla materia"
              title={`Torna a ${subject.name}`}
            >
              <ArrowLeft size={17} />
            </button>
          );
          const moveButton = (
            <button
              type="button"
              className="study-pane-action study-pane-reorder-handle"
              data-pane-reorder-handle
              disabled={state.panes.length < 2}
              aria-label={`Sposta pannello: ${name}`}
              aria-describedby={reorder.instructionsId}
              aria-keyshortcuts={
                stacked ? 'Alt+ArrowUp Alt+ArrowDown' : 'Alt+ArrowLeft Alt+ArrowRight'
              }
              onKeyDown={(event) => reorder.keyboard(event, pane.id, name)}
              title={
                state.panes.length > 1 ? 'Trascina per spostare · Alt + frecce' : label
              }
            >
              <GripVertical size={16} />
            </button>
          );
          const panelPicker = (
            <PanelPicker
              paneId={pane.id}
              panes={state.panes}
              resources={resources}
              onResource={(incoming) => onAddResource(incoming, pane.id)}
              onChat={() => onChat(pane.id)}
              onImport={() => onImport(undefined, { afterId: pane.id })}
              onNotebook={() => onNotebook({ afterId: pane.id })}
            />
          );
          const closeButton = state.panes.length > 1 && (
            <button
              type="button"
              className="study-pane-action study-pane-close"
              aria-label="Chiudi pannello"
              title={`Chiudi ${name}`}
              onClick={() => onClose(pane.id)}
            >
              <X size={16} />
            </button>
          );
          const renderControls = (newChat: () => void) => (
            <div
              className="study-pane-controls"
              role="group"
              aria-label={
                pane.kind === 'chat'
                  ? 'Comandi della chat'
                  : pane.kind === 'pdf'
                    ? 'Comandi del PDF'
                    : 'Comandi della lavagna'
              }
              onPointerDown={(event) => reorder.start(event, pane.id, name)}
              onClickCapture={reorder.captureClick}
              onDragStart={(event) => event.preventDefault()}
            >
              <div className="study-pane-controls-start">
                {backButton}
                {state.panes.length > 1 && moveButton}
              </div>
              <div className="study-pane-controls-end">
                {pane.kind === 'chat' ? (
                  <button
                    type="button"
                    className="study-new-chat-action"
                    aria-label="Nuova chat"
                    title="Nuova chat"
                    onClick={newChat}
                  >
                    <SquarePen size={18} />
                  </button>
                ) : (
                  resource && (
                    <ResourceSwitcher
                      compact
                      resource={resource}
                      resources={resources}
                      onChange={(incoming) => onResource(incoming, pane.id)}
                      onCreate={() =>
                        pane.kind === 'pdf'
                          ? onImport(undefined, { paneId: pane.id })
                          : onNotebook({ paneId: pane.id })
                      }
                    />
                  )
                )}
                {panelPicker}
                {closeButton}
              </div>
            </div>
          );
          return (
            <Fragment key={pane.id}>
              {index > 0 && (
                <PaneSeparator
                  left={state.panes[index - 1]}
                  right={pane}
                  stacked={stacked}
                  onResize={onResize}
                />
              )}
              <section
                className={`study-editor-pane study-${pane.kind}-pane${active ? ' is-active' : ''}${reorder.drag?.sourceId === pane.id ? ' is-dragging' : ''}`}
                data-pane-id={pane.id}
                data-pane-kind={pane.kind}
                data-drop-side={
                  reorder.drag?.target?.id === pane.id
                    ? reorder.drag.target.side
                    : undefined
                }
                style={{ flexGrow: pane.weight }}
                aria-label={`Pannello ${label}: ${name}`}
                onPointerDownCapture={() => {
                  if (!active) onActive(pane.id);
                }}
                onFocusCapture={() => {
                  if (!active) onActive(pane.id);
                }}
              >
                <div
                  className={`study-editor-surface${pane.kind !== 'chat' ? ' has-workspace-controls' : ''}`}
                >
                  {pane.kind !== 'chat' && renderControls(() => onChat(pane.id))}
                  {pane.kind === 'chat' ? (
                    <StudyChat
                      active={!suspended && active}
                      subject={subject}
                      resources={resources}
                      renderControls={renderControls}
                    />
                  ) : resource ? (
                    <Suspense
                      fallback={
                        <div className="study-editor-loading" role="status">
                          Apertura del materiale…
                        </div>
                      }
                    >
                      {pane.kind === 'pdf' ? (
                        <StoredPdfPanel
                          key={resource.id}
                          paneId={pane.id}
                          resourceId={resource.id}
                          active={!suspended && active}
                          onFileOpen={(file) => onImport(file, { paneId: pane.id })}
                        />
                      ) : (
                        <WhiteboardPage
                          key={resource.id}
                          paneId={pane.id}
                          documentId={resource.id}
                          active={!suspended && active}
                        />
                      )}
                    </Suspense>
                  ) : (
                    <div className="study-pane-empty">
                      <p>Questo materiale non è disponibile.</p>
                      <button
                        className="study-button study-button-secondary"
                        onClick={() => onClose(pane.id)}
                      >
                        Chiudi pannello
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </Fragment>
          );
        })}
      </div>
      {reorder.drag &&
        createPortal(
          <div
            className="study-pane-drag-preview"
            aria-hidden="true"
            style={{
              left: Math.max(8, Math.min(window.innerWidth - 228, reorder.drag.x + 14)),
              top: Math.max(8, Math.min(window.innerHeight - 64, reorder.drag.y + 18)),
            }}
          >
            <GripVertical size={17} />
            <span>
              {reorder.drag.label}
              <small>
                {reorder.drag.target
                  ? 'Rilascia per spostare'
                  : 'Trascina su un altro pannello'}
              </small>
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}

function PaneSeparator({
  left,
  right,
  stacked,
  onResize,
}: {
  left: WorkspacePane;
  right: WorkspacePane;
  stacked: boolean;
  onResize: WorkspaceProps['onResize'];
}) {
  const bounds = useRef<{ start: number; end: number } | null>(null);
  function start(event: PointerEvent<HTMLDivElement>) {
    const root = event.currentTarget.parentElement!;
    const a = root
      .querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(left.id)}"]`)!
      .getBoundingClientRect();
    const b = root
      .querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(right.id)}"]`)!
      .getBoundingClientRect();
    bounds.current = stacked
      ? { start: a.top, end: b.bottom }
      : { start: a.left, end: b.right };
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  return (
    <div
      className="study-split-handle"
      role="separator"
      tabIndex={0}
      aria-label="Ridimensiona pannelli affiancati"
      aria-orientation={stacked ? 'horizontal' : 'vertical'}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round((left.weight / (left.weight + right.weight)) * 100)}
      onPointerDown={start}
      onPointerMove={(event) => {
        if (!bounds.current || !event.currentTarget.hasPointerCapture(event.pointerId))
          return;
        const coordinate = stacked ? event.clientY : event.clientX;
        onResize(
          left.id,
          right.id,
          (coordinate - bounds.current.start) /
            (bounds.current.end - bounds.current.start),
        );
      }}
      onPointerUp={(event) => {
        bounds.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        bounds.current = null;
      }}
      onDoubleClick={() => onResize(left.id, right.id, 0.5)}
      onKeyDown={(event) => {
        const decrease = stacked ? 'ArrowUp' : 'ArrowLeft';
        const increase = stacked ? 'ArrowDown' : 'ArrowRight';
        if (event.key === decrease || event.key === increase) {
          event.preventDefault();
          event.stopPropagation();
          onResize(
            left.id,
            right.id,
            left.weight / (left.weight + right.weight) +
              (event.key === decrease ? -0.05 : 0.05),
          );
        }
        if (event.key === 'Home') {
          event.preventDefault();
          onResize(left.id, right.id, 0.5);
        }
      }}
    >
      <GripVertical size={13} />
    </div>
  );
}
