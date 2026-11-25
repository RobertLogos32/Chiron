import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { useStudyLibrary } from './features/study/hooks/useStudyLibrary';
import { StudySidebar } from './features/study/components/StudySidebar';
import { StudyLibrary } from './features/study/components/StudyLibrary';
import {
  StudyDialog,
  type DialogValues,
  type StudyDialogState,
} from './features/study/components/StudyDialog';
import {
  StudyWorkspace,
  type WorkspaceState,
} from './features/study/components/StudyWorkspace';
import {
  closePane,
  insertPane,
  openResourcePane,
  resizePanes,
  reorderPane,
  type OpenPaneOptions,
} from './features/study/model/workspace';
import type { StudyResource } from './features/study/model/library';
import { StudySettings } from './features/study/components/StudySettings';
import {
  AiRequestsProvider,
  useAiRequests,
} from './features/whiteboard/hooks/useAiRequests';
import { AiRequestsLayer } from './features/whiteboard/components/ai/AiRequestsLayer';

export default function App() {
  return (
    <AiRequestsProvider>
      <StudyApp />
    </AiRequestsProvider>
  );
}

function StudyApp() {
  const study = useStudyLibrary();
  const { registerNavigator } = useAiRequests();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [dialog, setDialog] = useState<StudyDialogState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(study.initialError);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpener = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importTarget = useRef<OpenPaneOptions>({});
  const notebookTarget = useRef<OpenPaneOptions>({});
  const paneToReveal = useRef<string | null>(null);
  const subject = study.library.subjects.find(
    (item) => item.id === study.library.selectedSubjectId,
  );
  const resources = study.library.resources.filter(
    (item) => item.subjectId === subject?.id,
  );
  useEffect(() => {
    const id = paneToReveal.current;
    if (!id || !workspace?.panes.some((pane) => pane.id === id)) return;
    const frame = requestAnimationFrame(() => {
      if (paneToReveal.current !== id) return;
      document
        .querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      paneToReveal.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [workspace]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        setPinned((value) => !value);
      }
      if (event.key === 'Escape' && !dialog) setSidebarOpen(false);
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [dialog]);

  async function run(action: () => void | Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Non riesco a completare l’operazione. Riprova.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function openResource(resource: StudyResource, options: OpenPaneOptions = {}) {
    setSettingsOpen(false);
    setError('');
    try {
      study.selectSubject(resource.subjectId);
      const sameSubject = workspace?.subjectId === resource.subjectId;
      const paneId =
        options.paneId ??
        (options.afterId
          ? undefined
          : sameSubject
            ? (workspace.panes.find((pane) => pane.resourceId === resource.id)?.id ??
              workspace.activeId)
            : undefined) ??
        crypto.randomUUID();
      paneToReveal.current = paneId;
      setWorkspace((previous) =>
        openResourcePane(previous, resource, { ...options, paneId }),
      );
      setSidebarOpen(false);
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Non riesco ad aprire il contenuto.',
      );
      return false;
    }
  }

  function openChat(afterId?: string) {
    if (!subject) return;
    const id = crypto.randomUUID();
    paneToReveal.current = id;
    setWorkspace((current) =>
      insertPane(
        current?.subjectId === subject.id && afterId
          ? current
          : { subjectId: subject.id, panes: [], activeId: '' },
        { id, kind: 'chat', weight: 1 },
        afterId,
      ),
    );
    setSettingsOpen(false);
    setSidebarOpen(false);
  }

  useEffect(
    () =>
      registerNavigator(async (target) => {
        const resource = study.library.resources.find(
          (item) => item.id === target.resourceId && item.kind === target.kind,
        );
        if (!resource) return false;
        const paneId =
          target.paneId ??
          workspace?.panes.find((pane) => pane.resourceId === resource.id)?.id ??
          crypto.randomUUID();
        const opened = await openResource(resource, { paneId });
        if (opened)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => {
              document
                .querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(paneId)}"]`)
                ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              resolve();
            }),
          );
        return opened;
      }),
    [registerNavigator, workspace, study.library.resources],
  );

  function selectSubject(id: string) {
    setSettingsOpen(false);
    setBusy(false);
    try {
      study.selectSubject(id);
      setWorkspace(null);
      setSidebarOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Non riesco ad aprire la materia.',
      );
    }
  }

  async function importFiles(files: File[], options: OpenPaneOptions = {}) {
    if (!subject || !files.length) return;
    await run(async () => {
      const added = await study.addPdfs(subject.id, files);
      if (workspace && added[0]) await openResource(added[0], options);
    });
  }

  async function saveDialog(values: DialogValues) {
    if (!dialog) return;
    if (dialog.kind === 'subject') {
      await study.addSubject(values.name, values.color, values.files);
      setWorkspace(null);
      setSidebarOpen(false);
      setSettingsOpen(false);
    } else if (dialog.kind === 'notebook' && subject) {
      const notebook = study.addNotebook(subject.id, values.name, values.color);
      await openResource(notebook, notebookTarget.current);
      notebookTarget.current = {};
    } else if (dialog.kind === 'rename')
      study.rename(dialog.target.id, values.name, dialog.target.kind);
    else if (dialog.kind === 'color')
      study.changeNotebookColor(dialog.target.id, values.color);
    else if (dialog.kind === 'delete') {
      await study.remove(dialog.target.id, dialog.target.kind);
      if (dialog.target.kind === 'subject' && workspace?.subjectId === dialog.target.id) {
        setWorkspace(null);
        setSidebarOpen(false);
        setSettingsOpen(false);
      }
    }
  }

  const editor = !!workspace && !!subject;
  const showSidebar = !editor || sidebarOpen || pinned;

  function openSettings() {
    settingsOpener.current = document.activeElement as HTMLElement | null;
    setSidebarOpen(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    requestAnimationFrame(() => {
      if (settingsOpener.current?.isConnected) settingsOpener.current.focus();
      else
        document
          .querySelector<HTMLElement>(
            '.study-workspace-back, .study-search input, .study-add-subject-card',
          )
          ?.focus();
    });
  }

  return (
    <div
      className={`study-app${editor ? ' is-editor' : ''}${pinned && editor ? ' has-pinned-sidebar' : ''}${sidebarOpen ? ' is-nav-open' : ''}`}
    >
      <a className="study-skip-link" href="#study-content">
        Vai ai contenuti
      </a>
      <AiRequestsLayer paused={settingsOpen || !!dialog} />
      {editor && !pinned && (
        <button
          className="study-nav-reveal"
          onMouseEnter={() => setSidebarOpen(true)}
          onClick={() => setSidebarOpen(true)}
          aria-label="Mostra navigazione materie"
          title="Mostra materie"
        />
      )}
      {showSidebar && (
        <StudySidebar
          library={study.library}
          editor={editor}
          pinned={pinned}
          activeId={
            workspace?.panes.find((pane) => pane.id === workspace.activeId)?.resourceId
          }
          onSubject={selectSubject}
          onResource={(resource) => void openResource(resource)}
          onNewSubject={() => setDialog({ kind: 'subject' })}
          onPin={() => setPinned((value) => !value)}
          onClose={() => setSidebarOpen(false)}
          onSettings={openSettings}
          onRename={(target) => setDialog({ kind: 'rename', target })}
          onDelete={(target) => setDialog({ kind: 'delete', target })}
          onLeave={() => {
            if (
              editor &&
              !pinned &&
              !document.querySelector('.study-sidebar :focus-visible') &&
              !document.querySelector('.study-context-menu[data-owner="subject"]')
            )
              setSidebarOpen(false);
          }}
        />
      )}
      {sidebarOpen && (
        <button
          className="study-nav-backdrop"
          aria-label="Chiudi navigazione"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div id="study-content" className="study-content" tabIndex={-1}>
        <div
          className={`study-content-view${settingsOpen ? ' is-suspended' : ''}`}
          inert={settingsOpen}
        >
          {editor && workspace && subject ? (
            <StudyWorkspace
              state={workspace}
              subject={subject}
              resources={resources}
              onBack={() => {
                setBusy(false);
                setWorkspace(null);
              }}
              suspended={settingsOpen}
              onActive={(id) =>
                setWorkspace((current) =>
                  current && current.activeId !== id
                    ? { ...current, activeId: id }
                    : current,
                )
              }
              onAddResource={(resource, afterId) =>
                void openResource(resource, { afterId })
              }
              onResource={(resource, paneId) => void openResource(resource, { paneId })}
              onChat={openChat}
              onClose={(id) =>
                setWorkspace((current) => (current ? closePane(current, id) : current))
              }
              onResize={(leftId, rightId, fraction) =>
                setWorkspace((current) =>
                  current ? resizePanes(current, leftId, rightId, fraction) : current,
                )
              }
              onReorder={(sourceId, targetId, side) =>
                setWorkspace((current) =>
                  current ? reorderPane(current, sourceId, targetId, side) : current,
                )
              }
              onImport={(incoming, options = {}) => {
                if (incoming) void importFiles([incoming], options);
                else {
                  importTarget.current = options;
                  fileInput.current?.click();
                }
              }}
              onNotebook={(options = {}) => {
                notebookTarget.current = options;
                setDialog({ kind: 'notebook' });
              }}
            />
          ) : (
            <StudyLibrary
              key={subject?.id ?? 'empty'}
              subject={subject}
              resources={resources}
              busy={busy}
              onMenu={() => setSidebarOpen(true)}
              onNewSubject={() => setDialog({ kind: 'subject' })}
              onExample={() => void run(study.addExample)}
              onImport={() => {
                importTarget.current = {};
                fileInput.current?.click();
              }}
              onNewNotebook={() => {
                notebookTarget.current = {};
                setDialog({ kind: 'notebook' });
              }}
              onChat={() => openChat()}
              onOpen={(resource) => void openResource(resource)}
              onRename={(target) => setDialog({ kind: 'rename', target })}
              onDelete={(target) => setDialog({ kind: 'delete', target })}
              onColor={(target) => setDialog({ kind: 'color', target })}
              onDrop={(incoming) => void importFiles(incoming)}
            />
          )}
        </div>
        {settingsOpen && <StudySettings onClose={closeSettings} fromWorkspace={editor} />}
      </div>
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="application/pdf,.pdf"
        multiple
        aria-label="Aggiungi PDF alla materia"
        onChange={(event) => {
          const options = importTarget.current;
          importTarget.current = {};
          void importFiles(Array.from(event.target.files ?? []), options);
          event.currentTarget.value = '';
        }}
      />
      {busy && (
        <div className="study-busy" role="status">
          <LoaderCircle className="study-spinner" size={15} />
          Apertura e salvataggio…
        </div>
      )}
      {error && (
        <div className="study-toast" role="alert">
          <span>{error}</span>
          <button
            className="study-icon-button"
            onClick={() => setError('')}
            aria-label="Chiudi avviso"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {dialog && (
        <StudyDialog
          key={dialog.kind + ('target' in dialog ? dialog.target.id : '')}
          state={dialog}
          onClose={() => setDialog(null)}
          onSave={saveDialog}
        />
      )}
    </div>
  );
}
