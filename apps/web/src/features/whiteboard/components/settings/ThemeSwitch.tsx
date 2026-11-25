import { Moon, Sun } from 'lucide-react';
import type { Theme } from '../../model/types';

type ThemeSwitchProps = { value: Theme; onChange: (theme: Theme) => void };

export function ThemeSwitch({ value, onChange }: ThemeSwitchProps) {
  return (
    <div className="theme-switch" role="group" aria-label="Tema">
      <button
        className={value === 'light' ? 'is-selected' : ''}
        aria-label="Tema chiaro"
        aria-pressed={value === 'light'}
        title="Tema chiaro"
        onClick={() => onChange('light')}
      >
        <Sun size={17} />
      </button>
      <button
        className={value === 'dark' ? 'is-selected' : ''}
        aria-label="Tema scuro"
        aria-pressed={value === 'dark'}
        title="Tema scuro"
        onClick={() => onChange('dark')}
      >
        <Moon size={17} />
      </button>
    </div>
  );
}
