import { Minus, Plus } from 'lucide-react';

export type ZoomControlsProps = {
  zoom: number;
  onChange: (value: number | ((zoom: number) => number)) => void;
};

export function ZoomControls({ zoom, onChange }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button
        aria-label="Riduci zoom"
        title="Riduci zoom (−)"
        disabled={zoom <= 0.25}
        onClick={() => onChange((value) => value / 1.25)}
      >
        <Minus size={16} />
      </button>
      <button
        className="zoom-level"
        aria-label="Ripristina zoom al 100%"
        title="Ripristina zoom al 100% (0)"
        onClick={() => onChange(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        aria-label="Aumenta zoom"
        title="Aumenta zoom (+)"
        disabled={zoom >= 4}
        onClick={() => onChange((value) => value * 1.25)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
