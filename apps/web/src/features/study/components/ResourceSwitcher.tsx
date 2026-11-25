import { useLayoutEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, Check, ChevronDown, FileText, Plus, Search } from 'lucide-react';
import { useOutsideDismiss } from '../../../shared/hooks/useOutsideDismiss';
import { displayStudyColor, formatFileSize, type StudyResource } from '../model/library';

type ResourceSwitcherProps = {
  resource: StudyResource;
  resources: StudyResource[];
  onChange: (resource: StudyResource) => void;
  onCreate: () => void;
  compact?: boolean;
};

export function ResourceSwitcher({
  resource,
  resources,
  onChange,
  onCreate,
  compact = false,
}: ResourceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [placement, setPlacement] = useState({ above: false, height: 360, left: 0 });
  const root = useOutsideDismiss(open, setOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const pdf = resource.kind === 'pdf';
  const label = pdf ? 'Cambia PDF' : 'Cambia quaderno';
  const filtered = resources.filter(
    (item) =>
      item.kind === resource.kind &&
      item.name.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')),
  );
  const count = resources.filter((item) => item.kind === resource.kind).length;
  const Icon = pdf ? FileText : BookOpen;

  useLayoutEffect(() => {
    if (open) {
      const bounds = trigger.current?.getBoundingClientRect();
      if (bounds) {
        const below = window.innerHeight - bounds.bottom - 16;
        const above = bounds.top - 16;
        const flip = below < 300 && above > below;
        const width = menu.current?.offsetWidth ?? 340;
        const preferredLeft = pdf ? bounds.left : bounds.right - width;
        const viewportLeft = Math.max(
          12,
          Math.min(preferredLeft, window.innerWidth - width - 12),
        );
        setPlacement({
          above: flip,
          height: Math.min(380, Math.max(180, flip ? above : below)),
          left: viewportLeft - bounds.left,
        });
      }
      search.current?.focus();
    } else setQuery('');
  }, [open, pdf]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function moveFocus(key: string) {
    const options = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (!options.length) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      key === 'Home'
        ? 0
        : key === 'End'
          ? options.length - 1
          : index === -1
            ? key === 'ArrowUp'
              ? options.length - 1
              : 0
            : key === 'ArrowDown'
              ? (index + 1) % options.length
              : (index - 1 + options.length) % options.length;
    options[next].focus();
  }

  return (
    <div
      ref={root}
      className={`study-resource-switcher${compact ? ' is-compact' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`study-resource-trigger${open ? ' is-open' : ''}`}
        aria-label={`${label}: ${resource.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={resource.name}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <span className="study-resource-trigger-name">{resource.name}</span>
        <span className="study-resource-trigger-action">
          {!compact && 'Cambia'}
          <ChevronDown size={13} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          className={`study-resource-popover${placement.above ? ' opens-above' : ''}`}
          style={
            {
              '--switcher-max-height': `${placement.height}px`,
              left: placement.left,
            } as CSSProperties
          }
          role="dialog"
          aria-label={label}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            if (
              ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
              (event.target !== search.current || event.key.startsWith('Arrow'))
            ) {
              event.preventDefault();
              moveFocus(event.key);
            }
          }}
        >
          <div className="study-switcher-heading">
            <span>{pdf ? 'PDF della materia' : 'Quaderni della materia'}</span>
            <span>{count}</span>
          </div>
          <label className="study-switcher-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={pdf ? 'Cerca un PDF' : 'Cerca un quaderno'}
              aria-label={pdf ? 'Cerca un PDF' : 'Cerca un quaderno'}
            />
          </label>
          <div
            className="study-switcher-options"
            role="listbox"
            aria-label={pdf ? 'PDF disponibili' : 'Quaderni disponibili'}
          >
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === resource.id}
                className="study-switcher-option"
                onClick={() => {
                  close();
                  if (item.id !== resource.id) onChange(item);
                }}
              >
                <span
                  className="study-switcher-item-icon"
                  style={{ color: pdf ? undefined : displayStudyColor(item.color) }}
                >
                  <Icon size={17} strokeWidth={1.6} />
                </span>
                <span className="study-switcher-item-name">
                  <span>{item.name}</span>
                  <small>
                    {item.id === resource.id
                      ? 'Aperto in questo pannello'
                      : pdf
                        ? formatFileSize(item.size)
                        : 'Quaderno'}
                  </small>
                </span>
                {item.id === resource.id && (
                  <Check size={15} className="study-switcher-check" aria-hidden="true" />
                )}
              </button>
            ))}
            {!filtered.length && (
              <p className="study-switcher-empty">
                Nessun risultato. Prova un altro nome.
              </p>
            )}
          </div>
          <button
            type="button"
            className="study-switcher-create"
            onClick={() => {
              close();
              onCreate();
            }}
          >
            <Plus size={15} />
            {pdf ? 'Aggiungi PDF' : 'Nuovo quaderno'}
          </button>
        </div>
      )}
    </div>
  );
}
