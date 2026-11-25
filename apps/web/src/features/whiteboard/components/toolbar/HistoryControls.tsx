import { Redo2, Undo2 } from 'lucide-react';

export type HistoryControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

export function HistoryControls({ canUndo, canRedo, undo, redo }: HistoryControlsProps) {
  return (
    <div className="tool-group history-tools">
      <button
        className="tool-button"
        aria-label="Annulla"
        title="Annulla (Ctrl+Z)"
        disabled={!canUndo}
        onClick={undo}
      >
        <Undo2 size={19} />
      </button>
      <button
        className="tool-button"
        aria-label="Ripeti"
        title="Ripeti (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={redo}
      >
        <Redo2 size={19} />
      </button>
    </div>
  );
}
