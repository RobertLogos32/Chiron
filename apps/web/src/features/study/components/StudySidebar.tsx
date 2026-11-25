import {
  BookOpen,
  ChevronLeft,
  FileText,
  HardDrive,
  PanelLeftClose,
  Pin,
  Plus,
  Settings,
} from 'lucide-react';
import { displayStudyColor, type Library, type StudyResource } from '../model/library';
import { ItemMenu } from './ItemMenu';
import type { DialogTarget } from './StudyDialog';

type SidebarProps = {
  library: Library;
  editor: boolean;
  pinned: boolean;
  activeId?: string;
  onSubject: (id: string) => void;
  onResource: (resource: StudyResource) => void;
  onNewSubject: () => void;
  onPin: () => void;
  onClose: () => void;
  onLeave: () => void;
  onSettings: () => void;
  onRename: (target: DialogTarget) => void;
  onDelete: (target: DialogTarget) => void;
};

export function StudySidebar({
  library,
  editor,
  pinned,
  activeId,
  onSubject,
  onResource,
  onNewSubject,
  onPin,
  onClose,
  onLeave,
  onSettings,
  onRename,
  onDelete,
}: SidebarProps) {
  const resources = library.resources.filter(
    (resource) => resource.subjectId === library.selectedSubjectId,
  );
  return (
    <aside
      className={`study-sidebar${editor ? ' study-sidebar-floating' : ''}${pinned ? ' is-pinned' : ''}`}
      aria-label="Navigazione materie"
      onMouseLeave={onLeave}
    >
      <div className="study-sidebar-controls">
        {editor ? (
          <button
            className={`study-icon-button${pinned ? ' is-active' : ''}`}
            onClick={onPin}
            aria-label={pinned ? 'Sblocca navigazione' : 'Fissa navigazione'}
            title="Fissa navigazione (Ctrl+\)"
          >
            <Pin size={15} />
          </button>
        ) : (
          <button
            className="study-icon-button study-mobile-close"
            onClick={onClose}
            aria-label="Chiudi navigazione"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>
      <nav className="study-subject-nav" aria-label="Materie">
        <p className="study-nav-label">Le tue materie</p>
        {!library.subjects.length && (
          <span className="study-nav-empty">Nessuna materia</span>
        )}
        {library.subjects.map((subject) => (
          <div
            key={subject.id}
            className={`study-subject-row${subject.id === library.selectedSubjectId ? ' is-selected' : ''}`}
          >
            <button
              className={`study-nav-item${subject.id === library.selectedSubjectId ? ' is-selected' : ''}`}
              onClick={() => onSubject(subject.id)}
              aria-current={subject.id === library.selectedSubjectId ? 'page' : undefined}
            >
              <span>{subject.name}</span>
              <small>
                {
                  library.resources.filter(
                    (resource) => resource.subjectId === subject.id,
                  ).length
                }
              </small>
            </button>
            <ItemMenu
              target={{ id: subject.id, name: subject.name, kind: 'subject' }}
              placement="subject"
              onRename={onRename}
              onDelete={onDelete}
            />
          </div>
        ))}
        <button className="study-nav-item study-new-subject" onClick={onNewSubject}>
          <Plus size={16} />
          <span>Nuova materia</span>
        </button>
      </nav>
      {editor && (
        <nav className="study-resource-nav" aria-label="In questa materia">
          <p className="study-nav-label">In questa materia</p>
          {resources.map((resource) => (
            <button
              key={resource.id}
              className={`study-nav-item${resource.id === activeId ? ' is-selected' : ''}`}
              onClick={() => onResource(resource)}
            >
              {resource.kind === 'pdf' ? (
                <FileText size={15} className="study-file-icon" />
              ) : (
                <BookOpen
                  size={15}
                  style={{ color: displayStudyColor(resource.color) }}
                />
              )}
              <span>{resource.name}</span>
            </button>
          ))}
          <button
            className="study-nav-item study-new-subject"
            onClick={() => {
              if (library.selectedSubjectId) onSubject(library.selectedSubjectId);
            }}
          >
            <ChevronLeft size={16} />
            <span>Torna agli allegati</span>
          </button>
        </nav>
      )}
      <div className="study-sidebar-bottom">
        <button className="study-nav-item" onClick={onSettings}>
          <Settings size={16} />
          <span>Impostazioni</span>
        </button>
        <div className="study-local-profile">
          <span className="study-profile-icon">
            <HardDrive size={17} />
          </span>
          <div>
            <span>Il tuo spazio di studio</span>
            <small>Salvato su questo dispositivo</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
