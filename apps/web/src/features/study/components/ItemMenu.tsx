import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, Palette, Pencil, Trash2 } from 'lucide-react';
import type { DialogTarget } from './StudyDialog';

type ItemMenuProps = {
  target: DialogTarget;
  onRename: (target: DialogTarget) => void;
  onDelete: (target: DialogTarget) => void;
  onColor?: (target: DialogTarget) => void;
  placement?: 'resource' | 'subject';
};

export function ItemMenu({
  target,
  onRename,
  onDelete,
  onColor,
  placement = 'resource',
}: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const id = useId();

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!open) return;
    function positionMenu() {
      const anchor = trigger.current?.getBoundingClientRect();
      const box = menu.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      if (
        !anchor.width ||
        !anchor.height ||
        anchor.bottom < 0 ||
        anchor.top > window.innerHeight
      ) {
        setOpen(false);
        return;
      }
      const gap = 7;
      let left = anchor.right - box.width;
      let top = anchor.bottom + gap;
      if (placement === 'subject') {
        left = anchor.right + gap;
        if (left + box.width > window.innerWidth - 12)
          left = anchor.left - box.width - gap;
        top = anchor.top;
      } else if (
        top + box.height > window.innerHeight - 12 &&
        anchor.top > window.innerHeight - anchor.bottom
      ) {
        top = anchor.top - box.height - gap;
      }
      setPosition({
        left: Math.max(12, Math.min(left, window.innerWidth - box.width - 12)),
        top: Math.max(12, Math.min(top, window.innerHeight - box.height - 12)),
      });
    }
    positionMenu();
    const options =
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    options?.[initialFocus.current === 'last' ? options.length - 1 : 0]?.focus();
    window.addEventListener('resize', positionMenu);
    return () => window.removeEventListener('resize', positionMenu);
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      target instanceof Node &&
      !trigger.current?.contains(target) &&
      !menu.current?.contains(target);
    const pointer = (event: PointerEvent) => {
      if (outside(event.target)) close();
    };
    const focus = (event: FocusEvent) => {
      if (outside(event.target)) close();
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target))
        close();
    };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('focusin', focus);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [open]);

  function choose(action: ItemMenuProps['onRename']) {
    close(true);
    action(target);
  }

  return (
    <div className={`study-item-menu${open ? ' is-open' : ''}`}>
      <button
        ref={trigger}
        type="button"
        className="study-menu-trigger"
        aria-label={`Opzioni di ${target.name}`}
        title={`Opzioni di ${target.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = 'first';
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }
        }}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="study-context-menu"
            data-owner={placement}
            role="menu"
            aria-label={`Azioni per ${target.name}`}
            style={{ left: position.left, top: position.top }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                close(true);
                return;
              }
              if (event.key === 'Tab') {
                close(true);
                return;
              }
              const options = Array.from(
                menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ??
                  [],
              );
              if (!options.length) return;
              const current = options.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? options.length - 1
                      : (current +
                          (event.key === 'ArrowDown' ? 1 : -1) +
                          options.length) %
                        options.length;
                options[next].focus();
              } else if (
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
              ) {
                const ordered = [
                  ...options.slice(current + 1),
                  ...options.slice(0, current + 1),
                ];
                const match = ordered.find((option) =>
                  option.textContent
                    ?.trim()
                    .toLocaleLowerCase('it')
                    .startsWith(event.key.toLocaleLowerCase('it')),
                );
                if (match) {
                  event.preventDefault();
                  match.focus();
                }
              }
            }}
          >
            <button type="button" role="menuitem" onClick={() => choose(onRename)}>
              <Pencil size={14} aria-hidden="true" />
              Rinomina
            </button>
            {onColor && (
              <button type="button" role="menuitem" onClick={() => choose(onColor)}>
                <Palette size={14} aria-hidden="true" />
                Cambia colore
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="is-destructive"
              onClick={() => choose(onDelete)}
            >
              <Trash2 size={14} aria-hidden="true" />
              Elimina
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
