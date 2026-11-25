import { useEffect, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import type { PasswordRequest } from '../model/types';

export function PasswordDialog({
  request,
  onCancel,
}: {
  request: PasswordRequest;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="pdf-password-modal"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        className="pdf-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
        onSubmit={(event) => {
          event.preventDefault();
          request.submit(password);
          setPassword('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <LockKeyhole size={25} />
        <h2 id="password-title">PDF protetto</h2>
        <p>Inserisci la password per aprire il documento.</p>
        <input
          autoFocus
          type="password"
          aria-label="Password del PDF"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {request.incorrect && <span role="alert">Password non corretta. Riprova.</span>}
        <div>
          <button type="button" onClick={onCancel}>
            Annulla
          </button>
          <button className="pdf-primary-button" type="submit" disabled={!password}>
            Apri documento
          </button>
        </div>
      </form>
    </dialog>
  );
}
