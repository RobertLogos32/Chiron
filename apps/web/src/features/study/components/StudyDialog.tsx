import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FileText, LoaderCircle, Upload, X } from 'lucide-react';
import {
  SUBJECT_COLORS,
  SUBJECT_COLOR_NAMES,
  displayStudyColor,
  formatFileSize,
  validatePdfs,
} from '../model/library';
import { ResourcePreview } from './ResourcePreview';

export type DialogTarget = {
  id: string;
  name: string;
  kind: 'subject' | 'resource';
  color?: string;
};
export type StudyDialogState =
  | { kind: 'subject' | 'notebook' }
  | { kind: 'rename' | 'delete' | 'color'; target: DialogTarget };
export type DialogValues = { name: string; color: string; files: File[] };

export function StudyDialog({
  state,
  onClose,
  onSave,
}: {
  state: StudyDialogState;
  onClose: () => void;
  onSave: (values: DialogValues) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('target' in state ? state.target.name : '');
  const [color, setColor] = useState(() =>
    displayStudyColor(
      'target' in state ? (state.target.color ?? SUBJECT_COLORS[0]) : SUBJECT_COLORS[0],
    ),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const deleting = state.kind === 'delete';
  const coloring = state.kind === 'color';
  const title = {
    subject: 'Nuova materia',
    notebook: 'Nuovo quaderno',
    rename: 'Rinomina',
    delete: 'Elimina',
    color: 'Colore del quaderno',
  }[state.kind];

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function addFiles(incoming: File[]) {
    try {
      validatePdfs(incoming);
      setFiles((previous) => [...previous, ...incoming]);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Scegli un PDF valido.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || (!deleting && !coloring && !name.trim())) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), color, files });
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Non riesco a salvare. Riprova.',
      );
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="study-dialog"
      aria-labelledby="study-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <header className="study-dialog-header">
          <div>
            <h2 id="study-dialog-title">{title}</h2>
            <p>
              {state.kind === 'subject'
                ? 'Uno spazio per le dispense e gli appunti del tuo corso.'
                : state.kind === 'notebook'
                  ? 'Un foglio libero per ragionare, disegnare e ripassare.'
                  : deleting
                    ? 'Questa operazione rimuove i contenuti dal dispositivo.'
                    : coloring
                      ? 'Scegli il colore della copertina.'
                      : 'Scegli un nome facile da ritrovare.'}
            </p>
          </div>
          <button
            type="button"
            className="study-icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Chiudi finestra"
          >
            <X size={18} />
          </button>
        </header>
        <div className="study-dialog-body">
          {deleting && 'target' in state ? (
            <p className="study-delete-description">
              Vuoi eliminare <strong>{state.target.name}</strong>?
              {state.target.kind === 'subject'
                ? ' Verranno rimossi anche i suoi PDF e quaderni.'
                : ''}
            </p>
          ) : (
            !coloring && (
              <label className="study-field">
                {state.kind === 'subject'
                  ? 'Nome della materia'
                  : state.kind === 'notebook'
                    ? 'Nome del quaderno'
                    : 'Nome'}
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={
                    state.kind === 'subject' ? 'Es. Analisi 1' : 'Es. Ripasso esame'
                  }
                  disabled={saving}
                />
              </label>
            )
          )}
          {coloring && 'target' in state && (
            <div className="study-color-edit-preview" aria-label="Anteprima copertina">
              <ResourcePreview
                resource={{
                  id: state.target.id,
                  name: state.target.name,
                  kind: 'notebook',
                  color,
                  subjectId: '',
                  createdAt: 0,
                }}
              />
              <span>{state.target.name}</span>
            </div>
          )}
          {(state.kind === 'subject' || state.kind === 'notebook' || coloring) && (
            <fieldset className="study-color-field">
              <legend>
                {state.kind === 'notebook' || coloring
                  ? 'Colore della copertina'
                  : 'Colore della materia'}
              </legend>
              <div>
                {SUBJECT_COLORS.map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={SUBJECT_COLOR_NAMES[index]}
                    aria-pressed={color === value}
                    onClick={() => setColor(value)}
                    style={{ backgroundColor: value }}
                    disabled={saving}
                  />
                ))}
              </div>
            </fieldset>
          )}
          {state.kind === 'subject' && (
            <div className="study-upload-field">
              <span>
                Allegati PDF <small>Facoltativi</small>
              </span>
              <button
                type="button"
                className={`study-upload-zone${dragging ? ' is-dragging' : ''}`}
                disabled={saving}
                onClick={() => input.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <Upload size={25} strokeWidth={1.5} />
                <span>
                  Trascina qui i PDF o <em>sfoglia</em>
                </span>
                <small>File .pdf, fino a 50 MB ciascuno</small>
              </button>
              <input
                ref={input}
                type="file"
                multiple
                accept="application/pdf,.pdf"
                hidden
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              {files.length > 0 && (
                <ul className="study-upload-list">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`}>
                      <FileText size={16} />
                      <span>{file.name}</span>
                      <small>{formatFileSize(file.size)}</small>
                      <button
                        type="button"
                        className="study-icon-button"
                        aria-label={`Rimuovi ${file.name}`}
                        disabled={saving}
                        onClick={() =>
                          setFiles((previous) => previous.filter((_, i) => i !== index))
                        }
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {error && (
            <p className="study-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="study-dialog-footer">
          <button
            type="button"
            className="study-button study-button-secondary"
            disabled={saving}
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            type="submit"
            className={`study-button ${deleting ? 'study-button-danger' : 'study-button-primary'}`}
            disabled={saving || (!deleting && !coloring && !name.trim())}
          >
            {saving && <LoaderCircle size={16} className="study-spinner" />}
            {saving
              ? 'Salvataggio…'
              : {
                  subject: 'Crea materia',
                  notebook: 'Crea quaderno',
                  rename: 'Salva nome',
                  delete: 'Elimina',
                  color: 'Salva colore',
                }[state.kind]}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
