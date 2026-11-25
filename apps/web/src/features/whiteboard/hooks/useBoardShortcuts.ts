import { useEffect, useRef } from 'react';
import { TOOLS } from '../config/tools';
import type { Tool } from '../model/types';

type ShortcutActions = {
  tool: Tool;
  isInteracting: () => boolean;
  hasSelection: boolean;
  closeOverlays: () => void;
  deleteSelection: () => void;
  selectAll: () => void;
  selectTool: (tool: Tool) => void;
  undo: () => void;
  redo: () => void;
  changeZoom: (value: number | ((zoom: number) => number)) => void;
};

export function useBoardShortcuts(actions: ShortcutActions, enabled = true) {
  const latest = useRef(actions);
  latest.current = actions;
  const isEnabled = useRef(enabled);
  isEnabled.current = enabled;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isEnabled.current) return;
      const actions = latest.current;
      const target = event.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable ||
        target.closest('dialog, [role="dialog"], [role="separator"]')
      )
        return;
      if (event.key === 'Escape') {
        actions.closeOverlays();
        return;
      }
      if (actions.isInteracting()) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (actions.hasSelection) {
          event.preventDefault();
          actions.deleteSelection();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) actions.redo();
          else actions.undo();
        } else if (key === 'y') {
          event.preventDefault();
          actions.redo();
        } else if (key === 'a' && actions.tool === 'select') {
          event.preventDefault();
          actions.selectAll();
        }
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        actions.changeZoom((zoom) => zoom * 1.25);
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        actions.changeZoom((zoom) => zoom / 1.25);
        return;
      }
      if (event.key === '0') {
        actions.changeZoom(1);
        return;
      }
      const next = TOOLS.find(
        (tool) => tool.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (next) actions.selectTool(next.id);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
