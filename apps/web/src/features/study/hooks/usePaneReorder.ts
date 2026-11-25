import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

type DropTarget = { id: string; side: 'before' | 'after' };
type DragPreview = {
  sourceId: string;
  label: string;
  x: number;
  y: number;
  target: DropTarget | null;
};
type Gesture = {
  sourceId: string;
  label: string;
  pointerId: number;
  element: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
  target: DropTarget | null;
};
type Options = {
  ids: string[];
  stacked: boolean;
  suspended: boolean;
  onReorder: (sourceId: string, targetId: string, side: 'before' | 'after') => void;
};

export function usePaneReorder(options: Options) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  const [drag, setDrag] = useState<DragPreview | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const instructionsId = useId();

  useEffect(() => {
    let frame = 0;
    function focusHandle(id: string) {
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLElement>(
            `[data-pane-id="${CSS.escape(id)}"] [data-pane-reorder-handle]`,
          )
          ?.focus({ preventScroll: true }),
      );
    }
    function finish(commit: boolean) {
      const current = gesture.current;
      gesture.current = null;
      cancelAnimationFrame(frame);
      setDrag(null);
      if (!current) return;
      if (current.element.hasPointerCapture(current.pointerId))
        current.element.releasePointerCapture(current.pointerId);
      if (!current.dragging) return;
      suppressClickUntil.current = performance.now() + 350;
      if (commit && current.target) {
        latest.current.onReorder(
          current.sourceId,
          current.target.id,
          current.target.side,
        );
        setAnnouncement(`${current.label}: pannello spostato.`);
      } else setAnnouncement('Spostamento annullato.');
      focusHandle(current.sourceId);
    }
    function update() {
      const current = gesture.current;
      const container = root.current;
      if (!current?.dragging || !container) return;
      const { stacked, suspended } = latest.current;
      if (suspended || !latest.current.ids.includes(current.sourceId)) {
        finish(false);
        return;
      }
      const bounds = container.getBoundingClientRect();
      const coordinate = stacked ? current.y : current.x;
      const start = stacked ? bounds.top : bounds.left;
      const end = stacked ? bounds.bottom : bounds.right;
      const inside =
        current.x >= bounds.left - 12 &&
        current.x <= bounds.right + 12 &&
        current.y >= bounds.top - 12 &&
        current.y <= bounds.bottom + 12;
      if (inside) {
        const distance = 44;
        const speed =
          coordinate < start + distance
            ? -Math.ceil(14 * Math.max(0, 1 - (coordinate - start) / distance))
            : coordinate > end - distance
              ? Math.ceil(14 * Math.max(0, 1 - (end - coordinate) / distance))
              : 0;
        if (stacked) container.scrollTop += speed;
        else container.scrollLeft += speed;
      }
      const panes = [
        ...container.querySelectorAll<HTMLElement>(':scope > .study-editor-pane'),
      ];
      let target: DropTarget | null = null;
      if (inside) {
        const candidate =
          panes.find((pane) => {
            const rect = pane.getBoundingClientRect();
            return (
              coordinate >= (stacked ? rect.top : rect.left) &&
              coordinate <= (stacked ? rect.bottom : rect.right)
            );
          }) ??
          panes.reduce<HTMLElement | null>((nearest, pane) => {
            const rect = pane.getBoundingClientRect();
            const center = stacked
              ? (rect.top + rect.bottom) / 2
              : (rect.left + rect.right) / 2;
            if (!nearest) return pane;
            const other = nearest.getBoundingClientRect();
            return Math.abs(coordinate - center) <
              Math.abs(
                coordinate -
                  (stacked
                    ? (other.top + other.bottom) / 2
                    : (other.left + other.right) / 2),
              )
              ? pane
              : nearest;
          }, null);
        if (candidate && candidate.dataset.paneId !== current.sourceId) {
          const rect = candidate.getBoundingClientRect();
          target = {
            id: candidate.dataset.paneId!,
            side:
              coordinate <
              (stacked ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2)
                ? 'before'
                : 'after',
          };
        }
      }
      current.target = target;
      const preview: DragPreview = {
        sourceId: current.sourceId,
        label: current.label,
        x: current.x,
        y: current.y,
        target,
      };
      setDrag((previous) =>
        previous &&
        previous.x === preview.x &&
        previous.y === preview.y &&
        previous.target?.id === target?.id &&
        previous.target?.side === target?.side
          ? previous
          : preview,
      );
      frame = requestAnimationFrame(update);
    }
    function move(event: PointerEvent) {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      current.x = event.clientX;
      current.y = event.clientY;
      if (
        !current.dragging &&
        Math.hypot(current.x - current.startX, current.y - current.startY) >= 6
      ) {
        current.dragging = true;
        current.element.setPointerCapture(event.pointerId);
        setAnnouncement(
          `Spostamento di ${current.label}. Rilascia sul pannello di destinazione.`,
        );
        frame = requestAnimationFrame(update);
      }
      if (current.dragging) event.preventDefault();
    }
    function up(event: PointerEvent) {
      if (gesture.current?.pointerId !== event.pointerId) return;
      gesture.current.x = event.clientX;
      gesture.current.y = event.clientY;
      if (gesture.current.dragging) {
        cancelAnimationFrame(frame);
        update();
        cancelAnimationFrame(frame);
      }
      finish(event.type === 'pointerup');
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && gesture.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      }
    }
    const blur = () => finish(false);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', escape, true);
    return () => {
      cancelAnimationFrame(frame);
      const current = gesture.current;
      gesture.current = null;
      if (current?.element.hasPointerCapture(current.pointerId))
        current.element.releasePointerCapture(current.pointerId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', escape, true);
    };
  }, []);

  function start(event: ReactPointerEvent<HTMLElement>, sourceId: string, label: string) {
    // A fresh press is intentional, including clicks on close/settings buttons.
    // Only suppress the synthetic click generated by the drag that just ended.
    if (!gesture.current) suppressClickUntil.current = 0;
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      latest.current.ids.length < 2 ||
      latest.current.suspended ||
      gesture.current
    )
      return;
    const control = (event.target as HTMLElement).closest(
      'button, input, textarea, select, a, [role="button"]',
    );
    if (
      control &&
      !control.hasAttribute('data-pane-reorder-handle') &&
      !(
        control.classList.contains('study-resource-trigger') &&
        control.getAttribute('aria-expanded') !== 'true'
      )
    )
      return;
    gesture.current = {
      sourceId,
      label,
      pointerId: event.pointerId,
      element: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      target: null,
    };
  }
  function keyboard(event: ReactKeyboardEvent, sourceId: string, label: string) {
    if (!event.altKey || latest.current.suspended) return;
    const { ids, stacked } = latest.current;
    const direction =
      event.key === (stacked ? 'ArrowUp' : 'ArrowLeft')
        ? -1
        : event.key === (stacked ? 'ArrowDown' : 'ArrowRight')
          ? 1
          : 0;
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const index = ids.indexOf(sourceId);
    const target = ids[index + direction];
    if (!target) return;
    latest.current.onReorder(sourceId, target, direction < 0 ? 'before' : 'after');
    setAnnouncement(`${label}: posizione ${index + direction + 1} di ${ids.length}.`);
    requestAnimationFrame(() => {
      const pane = root.current?.querySelector<HTMLElement>(
        `[data-pane-id="${CSS.escape(sourceId)}"]`,
      );
      pane
        ?.querySelector<HTMLElement>('[data-pane-reorder-handle]')
        ?.focus({ preventScroll: true });
      pane?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  return {
    root,
    drag,
    announcement,
    instructionsId,
    start,
    keyboard,
    captureClick(event: React.MouseEvent) {
      if (performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
