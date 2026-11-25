import { useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Menu,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { formatFileSize, type StudyResource, type Subject } from '../model/library';
import type { DialogTarget } from './StudyDialog';
import { ResourcePreview } from './ResourcePreview';
import { ItemMenu } from './ItemMenu';
import { ChatAiIcon } from './ChatAiIcon';

type LibraryProps = {
  subject?: Subject;
  resources: StudyResource[];
  busy: boolean;
  onMenu: () => void;
  onNewSubject: () => void;
  onExample: () => void;
  onImport: () => void;
  onNewNotebook: () => void;
  onChat: () => void;
  onOpen: (resource: StudyResource) => void;
  onRename: (target: DialogTarget) => void;
  onDelete: (target: DialogTarget) => void;
  onColor: (target: DialogTarget) => void;
  onDrop: (files: File[]) => void;
};

export function StudyLibrary({
  subject,
  resources,
  busy,
  onMenu,
  onNewSubject,
  onExample,
  onImport,
  onNewNotebook,
  onChat,
  onOpen,
  onRename,
  onDelete,
  onColor,
  onDrop,
}: LibraryProps) {
  const [filter, setFilter] = useState<'all' | 'pdf' | 'notebook'>('all');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const pdfs = resources.filter((resource) => resource.kind === 'pdf').length;
  const notebooks = resources.length - pdfs;
  const visible = resources
    .filter(
      (resource) =>
        (filter === 'all' || resource.kind === filter) &&
        resource.name.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it')),
    )
    .sort((a, b) =>
      a.kind === b.kind ? a.createdAt - b.createdAt : a.kind === 'pdf' ? -1 : 1,
    );
  const navigationButton = (
    <button
      className="study-icon-button study-mobile-menu"
      onClick={onMenu}
      aria-label="Apri navigazione"
    >
      <Menu size={20} />
    </button>
  );

  return (
    <main
      className={`study-library${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        if (subject && event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (subject && !busy) onDrop(Array.from(event.dataTransfer.files));
      }}
    >
      {!subject && navigationButton}
      {!subject ? (
        <div className="study-first-access">
          <button className="study-add-subject-card" onClick={onNewSubject}>
            <span className="study-empty-plus">
              <Plus size={27} strokeWidth={1.5} />
            </span>
            <h1>Aggiungi una materia</h1>
            <p>
              Dai un nome al corso e raccogli le tue dispense.
              <br />
              Il tuo prossimo quaderno comincia da qui.
            </p>
            <span className="study-empty-action">
              Crea la prima materia
              <ChevronRight size={15} />
            </span>
          </button>
          <button className="study-example-link" disabled={busy} onClick={onExample}>
            {busy
              ? 'Preparazione dell’esempio…'
              : 'Esplora con un PDF e un quaderno di esempio'}
          </button>
        </div>
      ) : (
        <>
          <header className="study-library-header">
            <div>
              <div className="study-subject-heading">
                {navigationButton}
                <h1>{subject.name}</h1>
              </div>
            </div>
            <div className="study-filter-tabs" role="group" aria-label="Filtra contenuti">
              {(
                [
                  ['all', 'Tutti', resources.length],
                  ['pdf', 'Allegati', pdfs],
                  ['notebook', 'Quaderni', notebooks],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  className={filter === value ? 'is-selected' : ''}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
          </header>
          <div className="study-library-tools">
            <label className="study-search">
              <Search size={16} />
              <input
                type="search"
                placeholder="Cerca in questa materia"
                aria-label="Cerca in questa materia"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  className="study-icon-button"
                  aria-label="Cancella ricerca"
                  onClick={() => setSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
          {visible.length ? (
            <div className="study-resource-grid">
              {visible.map((resource) => (
                <article className="study-resource-card" key={resource.id}>
                  <button
                    className="study-resource-open"
                    onClick={() => onOpen(resource)}
                    disabled={busy}
                    aria-label={`Apri ${resource.name}`}
                  >
                    <ResourcePreview resource={resource} />
                    <span className="study-resource-name">{resource.name}</span>
                    <span className="study-resource-meta">
                      {resource.kind === 'pdf'
                        ? formatFileSize(resource.size)
                        : 'Lavagna personale'}
                    </span>
                  </button>
                  <ItemMenu
                    target={{
                      id: resource.id,
                      name: resource.name,
                      kind: 'resource',
                      color: resource.color,
                    }}
                    onRename={onRename}
                    onDelete={onDelete}
                    onColor={resource.kind === 'notebook' ? onColor : undefined}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="study-library-empty">
              {search ? (
                <Search size={30} strokeWidth={1} />
              ) : filter === 'notebook' ? (
                <BookOpen size={34} strokeWidth={1} />
              ) : (
                <FolderOpen size={34} strokeWidth={1} />
              )}
              <h2>
                {search
                  ? 'Nessun risultato'
                  : filter === 'notebook'
                    ? 'Il primo appunto comincia qui'
                    : filter === 'pdf'
                      ? 'Aggiungi le tue dispense'
                      : 'Fai spazio alle tue idee'}
              </h2>
              <p>
                {search
                  ? 'Prova con un altro nome o cambia filtro.'
                  : 'Carica un PDF o crea un quaderno per iniziare a studiare.'}
              </p>
              {!search && (
                <button
                  className="study-button study-button-secondary"
                  onClick={filter === 'notebook' ? onNewNotebook : onImport}
                >
                  {filter === 'notebook' ? (
                    <>
                      <Plus size={16} />
                      Crea quaderno
                    </>
                  ) : (
                    <>
                      <FilePlus2 size={16} />
                      Aggiungi allegato
                    </>
                  )}
                </button>
              )}
            </div>
          )}
          <footer className="study-library-actions">
            <span>I tuoi materiali restano sul dispositivo.</span>
            <div>
              <button
                className="study-button study-start-chat"
                aria-label="Inizia la chat AI"
                disabled={busy}
                onClick={onChat}
              >
                <ChatAiIcon size={44} />
                <span>Inizia la chat</span>
              </button>
              <button
                className="study-button study-button-secondary"
                disabled={busy}
                onClick={onImport}
              >
                <FilePlus2 size={17} />
                Aggiungi allegato
              </button>
              <button
                className="study-button study-button-primary"
                disabled={busy}
                onClick={onNewNotebook}
              >
                <Plus size={17} />
                Crea quaderno
              </button>
            </div>
          </footer>
        </>
      )}
      {dragging && (
        <div className="study-library-drop">
          <FilePlus2 size={34} />
          <span>Rilascia i PDF per aggiungerli a {subject?.name}</span>
        </div>
      )}
    </main>
  );
}
