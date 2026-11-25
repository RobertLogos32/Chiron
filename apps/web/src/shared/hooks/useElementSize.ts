import { useEffect, useState, type RefObject } from 'react';

export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  initial = { width: 1, height: 1 },
  box: 'content-box' | 'border-box' = 'content-box',
) {
  const [size, setSize] = useState(initial);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const bounds =
        box === 'border-box' ? element.getBoundingClientRect() : entry.contentRect;
      // Flex layouts distribute fractional pixels differently after a reorder.
      // Keep the same viewport for that noise, so a moved PDF does not refit.
      setSize((previous) =>
        Math.abs(previous.width - bounds.width) < 0.5 &&
        Math.abs(previous.height - bounds.height) < 0.5
          ? previous
          : { width: bounds.width, height: bounds.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, box]);

  return size;
}
