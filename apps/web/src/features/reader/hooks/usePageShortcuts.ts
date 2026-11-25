import { useEffect, useRef } from 'react';

export function usePageShortcuts(onChange: (delta: number) => void, enabled = true) {
  const latest = useRef(onChange);
  latest.current = onChange;
  const isEnabled = useRef(enabled);
  isEnabled.current = enabled;

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (!isEnabled.current) return;
      const target = event.target;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, button, dialog, [role="dialog"], [role="separator"]',
          ))
      )
        return;
      const delta = ['PageDown', 'ArrowRight'].includes(event.key)
        ? 1
        : ['PageUp', 'ArrowLeft'].includes(event.key)
          ? -1
          : 0;
      if (!delta) return;
      event.preventDefault();
      latest.current(delta);
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, []);
}
