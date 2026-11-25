import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

export function useOutsideDismiss(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, setOpen]);

  return root;
}
