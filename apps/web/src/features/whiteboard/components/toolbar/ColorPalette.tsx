import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { COLORS } from '../../config/defaults';
import { inkColor } from '../../model/appearance';
import type { Theme } from '../../model/types';
import { useOutsideDismiss } from '../../../../shared/hooks/useOutsideDismiss';
export function ColorPalette({
  color,
  theme,
  disabled,
  onChange,
}: {
  color: string;
  theme: Theme;
  disabled: boolean;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useOutsideDismiss(open, setOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const pointerType = useRef('mouse');
  const id = useId();
  const visible = open && !disabled;
  const focusColor = () => requestAnimationFrame(() => trigger.current?.focus());
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div
      ref={root}
      className={`color-palette ${visible ? 'is-open' : ''}`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && !disabled) setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (!visible || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        const buttons = [
          ...root.current!.querySelectorAll<HTMLButtonElement>('[data-color]'),
        ];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      <button
        ref={trigger}
        data-color={color}
        className="palette-trigger"
        aria-label="Scegli colore"
        title="Scegli colore"
        aria-expanded={visible}
        aria-controls={id}
        disabled={disabled}
        onPointerDown={(event) => {
          pointerType.current = event.pointerType;
        }}
        onClick={(event) => {
          if (event.detail > 0 && pointerType.current === 'mouse') setOpen(true);
          else {
            setOpen(!open);
            if (!open) focusColor();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
            focusColor();
          }
        }}
      >
        <span
          className="current-color"
          style={{ '--color': inkColor(color, theme) } as CSSProperties}
        />
      </button>
      <div
        id={id}
        className="palette-inline"
        role="group"
        aria-label="Palette colori"
        aria-hidden={!visible}
        inert={!visible}
      >
        <div className="colors">
          {COLORS.filter((c) => c !== color).map((c) => (
            <button
              key={c}
              data-color={c}
              className="color-button"
              style={{ '--color': inkColor(c, theme) } as CSSProperties}
              aria-label={`Colore ${c}`}
              tabIndex={visible ? 0 : -1}
              disabled={disabled}
              onClick={() => {
                onChange(c);
                setOpen(false);
                trigger.current?.focus();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
