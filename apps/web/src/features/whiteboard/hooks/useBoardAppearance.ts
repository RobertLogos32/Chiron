import { useEffect, useSyncExternalStore } from 'react';
import type { Appearance, Pattern, Theme } from '../model/types';
import { APPEARANCE_KEY, loadAppearance, saveAppearance } from '../services/storage';

let snapshot: Appearance | undefined;
const listeners = new Set<() => void>();
const getSnapshot = () => (snapshot ??= loadAppearance());

function onStorage(event: StorageEvent) {
  if (event.key !== APPEARANCE_KEY && event.key !== null) return;
  snapshot = loadAppearance();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}

function updateAppearance(update: Partial<Appearance>) {
  const previous = getSnapshot();
  const next = { ...previous, ...update };
  if (previous.theme === next.theme && previous.pattern === next.pattern) return;
  snapshot = next;
  try {
    saveAppearance(next);
  } catch {
    /* Preferences remain usable when browser storage is unavailable. */
  }
  listeners.forEach((listener) => listener());
}

export function useBoardAppearance() {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    document.documentElement.style.colorScheme = appearance.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', appearance.theme === 'dark' ? '#202329' : '#f7f8fa');
  }, [appearance]);

  const setTheme = (theme: Theme) => updateAppearance({ theme });
  const setPattern = (pattern: Pattern) => updateAppearance({ pattern });

  return { ...appearance, setTheme, setPattern };
}
