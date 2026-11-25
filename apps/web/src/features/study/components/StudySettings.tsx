import { useEffect, useRef } from 'react';
import { ArrowLeft, Check, HardDrive, Moon, Sun } from 'lucide-react';
import { useBoardAppearance } from '@whiteboard/hooks/useBoardAppearance';

export function StudySettings({
  onClose,
  fromWorkspace,
}: {
  onClose: () => void;
  fromWorkspace: boolean;
}) {
  const appearance = useBoardAppearance();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <main
      className="study-settings-page"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="study-settings-content">
        <button className="study-settings-back" onClick={onClose}>
          <ArrowLeft size={17} />
          {fromWorkspace ? 'Torna allo studio' : 'Torna alla libreria'}
        </button>
        <header className="study-settings-heading">
          <h1 ref={heading} tabIndex={-1}>
            Impostazioni
          </h1>
          <p>Personalizza il tuo spazio di studio.</p>
        </header>
        <section className="study-settings-section" aria-labelledby="study-theme-title">
          <h2 id="study-theme-title">Aspetto</h2>
          <p>Scegli il tema del visualizzatore PDF e della lavagna.</p>
          <div className="study-theme-choices" role="group" aria-label="Tema">
            {(
              [
                ['light', Sun, 'Chiaro'],
                ['dark', Moon, 'Scuro'],
              ] as const
            ).map(([theme, Icon, label]) => (
              <button
                key={theme}
                type="button"
                className={`study-theme-choice${theme === appearance.theme ? ' is-selected' : ''}`}
                aria-label={`Tema ${label.toLowerCase()}`}
                aria-pressed={theme === appearance.theme}
                onClick={() => appearance.setTheme(theme)}
              >
                <span
                  className={`study-theme-preview preview-theme-${theme}`}
                  aria-hidden="true"
                >
                  <span className="study-theme-preview-page" />
                  <span className="study-theme-preview-ink" />
                  <Icon size={18} />
                </span>
                <span className="study-theme-choice-label">
                  {label}
                  {appearance.theme === theme && <Check size={16} />}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section
          className="study-settings-section study-storage-info"
          aria-labelledby="study-storage-title"
        >
          <HardDrive size={19} />
          <div>
            <h2 id="study-storage-title">I tuoi materiali</h2>
            <p>
              PDF e appunti si salvano automaticamente in questo browser. Riapri Chiron
              sullo stesso dispositivo per ritrovarli.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
