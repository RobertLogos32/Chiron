import { useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Pattern } from '../../model/types';
import { useOutsideDismiss } from '../../../../shared/hooks/useOutsideDismiss';
const PATTERNS: { id: Pattern; label: string }[] = [
  { id: 'blank', label: 'Libera' },
  { id: 'ruled', label: 'A righe' },
  { id: 'grid', label: 'A quadretti' },
  { id: 'dots', label: 'Puntinata' },
];

export function BackgroundPicker({
  value,
  onChange,
}: {
  value: Pattern;
  onChange: (pattern: Pattern) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(value);
  const root = useOutsideDismiss(open, setOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = PATTERNS.find((pattern) => pattern.id === value)!;
  const focusOption = (pattern: Pattern) =>
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-pattern="${pattern}"]`)
        ?.focus(),
    );
  const showMenu = () => {
    setFocused(value);
    setOpen(true);
    focusOption(value);
  };
  const choose = (pattern: Pattern) => {
    onChange(pattern);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div
      ref={root}
      className="background-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className={`background-trigger ${open ? 'is-open' : ''}`}
        aria-label="Sfondo lavagna"
        title={`Sfondo lavagna: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (open) setOpen(false);
          else showMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            showMenu();
          }
        }}
      >
        <span aria-hidden="true" className={`background-glyph preview-${value}`} />
        <span className="background-trigger-label">{selected.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          id={id}
          className="background-menu"
          role="menu"
          aria-label="Scegli lo sfondo"
          onKeyDown={(event) => {
            if (event.key === 'Tab') return;
            if (event.key === 'Escape') return;
            event.stopPropagation();
            if (
              ![
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            const current = PATTERNS.findIndex((pattern) => pattern.id === focused);
            const step =
              event.key === 'ArrowLeft'
                ? -1
                : event.key === 'ArrowRight'
                  ? 1
                  : event.key === 'ArrowUp'
                    ? -2
                    : 2;
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? PATTERNS.length - 1
                  : (current + step + PATTERNS.length) % PATTERNS.length;
            setFocused(PATTERNS[next].id);
            focusOption(PATTERNS[next].id);
          }}
        >
          <div className="background-menu-title" aria-hidden="true">
            Sfondo della lavagna
          </div>
          <div className="background-options" role="group">
            {PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                data-pattern={pattern.id}
                role="menuitemradio"
                aria-checked={pattern.id === value}
                tabIndex={pattern.id === focused ? 0 : -1}
                className={`background-option ${pattern.id === value ? 'is-selected' : ''}`}
                onFocus={() => setFocused(pattern.id)}
                onClick={() => choose(pattern.id)}
              >
                <span
                  aria-hidden="true"
                  className={`background-preview preview-${pattern.id}`}
                >
                  {pattern.id === value && (
                    <span className="background-check">
                      <Check size={12} strokeWidth={2.4} />
                    </span>
                  )}
                </span>
                <span>{pattern.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
