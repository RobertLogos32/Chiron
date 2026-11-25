import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, FileText, PanelRightOpen, Plus, Search, X } from 'lucide-react';
import type { StudyResource } from '../model/library';
import type { WorkspacePane } from '../model/workspace';
import { ChatAiIcon } from './ChatAiIcon';

export function PanelPicker({
  paneId,
  resources,
  panes,
  onResource,
  onChat,
  onImport,
  onNotebook,
}: {
  paneId: string;
  resources: StudyResource[];
  panes: WorkspacePane[];
  onResource: (resource: StudyResource) => void;
  onChat: () => void;
  onImport: () => void;
  onNotebook: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'pdf' | 'notebook'>('pdf');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ left: 12, top: 52, height: 440 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      top: rect.bottom + 8,
      height: Math.max(160, window.innerHeight - rect.bottom - 24),
    });
    search.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        setOpen(false);
    };
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    const focus = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    document.addEventListener('focusin', focus);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
      document.removeEventListener('focusin', focus);
    };
  }, [open]);
  const filtered = resources.filter(
    (resource) =>
      resource.kind === kind &&
      resource.name.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')),
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="study-pane-action study-pane-add"
        aria-label="Affianca un pannello"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-owner-pane={paneId}
        title="Affianca un pannello"
        onClick={() => {
          setQuery('');
          setOpen((value) => !value);
        }}
      >
        <PanelRightOpen size={17} />
        <Plus className="study-pane-add-mark" size={9} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="study-panel-picker"
            role="dialog"
            aria-label="Affianca un pannello"
            style={{ left: position.left, top: position.top, maxHeight: position.height }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const options = [
                  ...menu.current!.querySelectorAll<HTMLButtonElement>(
                    'button:not(.study-picker-close)',
                  ),
                ];
                const current = options.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  event.key === 'ArrowDown'
                    ? (current + 1) % options.length
                    : (current - 1 + options.length) % options.length;
                event.preventDefault();
                options[next]?.focus();
              }
            }}
          >
            <div className="study-picker-heading">
              <span>Affianca un pannello</span>
              <button
                className="study-icon-button study-picker-close"
                aria-label="Chiudi scelta pannello"
                onClick={close}
              >
                <X size={16} />
              </button>
            </div>
            <div
              className="study-picker-types"
              role="group"
              aria-label="Tipo di pannello"
            >
              {(
                [
                  ['pdf', FileText, 'PDF'],
                  ['notebook', BookOpen, 'Lavagna'],
                  ['chat', ChatAiIcon, 'Chat AI'],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  className={value === 'chat' ? 'study-picker-chat-action' : undefined}
                  aria-pressed={value === 'chat' ? undefined : kind === value}
                  title={value === 'chat' ? 'Apri una nuova chat AI' : undefined}
                  onClick={() => {
                    if (value === 'chat') {
                      close();
                      onChat();
                      return;
                    }
                    setKind(value);
                    setQuery('');
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <>
              <label className="study-switcher-search">
                <Search size={15} />
                <input
                  ref={search}
                  type="search"
                  aria-label={
                    kind === 'pdf'
                      ? 'Cerca PDF da affiancare'
                      : 'Cerca lavagna da affiancare'
                  }
                  placeholder={kind === 'pdf' ? 'Cerca un PDF' : 'Cerca un quaderno'}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="study-picker-resources">
                {filtered.map((resource) => (
                  <button
                    key={resource.id}
                    type="button"
                    className="study-switcher-option"
                    aria-label={`Affianca ${resource.name}`}
                    onClick={() => {
                      close();
                      onResource(resource);
                    }}
                  >
                    <span className="study-switcher-item-icon">
                      {kind === 'pdf' ? <FileText size={17} /> : <BookOpen size={17} />}
                    </span>
                    <span className="study-switcher-item-name">
                      <span>{resource.name}</span>
                      <small>
                        {panes.some((pane) => pane.resourceId === resource.id)
                          ? 'Apri un’altra vista'
                          : kind === 'pdf'
                            ? 'Documento PDF'
                            : 'Quaderno'}
                      </small>
                    </span>
                    <Plus size={15} />
                  </button>
                ))}
                {!filtered.length && (
                  <p className="study-switcher-empty">
                    {query
                      ? 'Nessun risultato.'
                      : kind === 'pdf'
                        ? 'Aggiungi un PDF a questa materia.'
                        : 'Crea un quaderno per iniziare.'}
                  </p>
                )}
              </div>
              <button
                className="study-switcher-create"
                onClick={() => {
                  close();
                  if (kind === 'pdf') onImport();
                  else onNotebook();
                }}
              >
                <Plus size={15} />
                {kind === 'pdf' ? 'Aggiungi PDF' : 'Nuovo quaderno'}
              </button>
            </>
          </div>,
          document.body,
        )}
    </>
  );
}
