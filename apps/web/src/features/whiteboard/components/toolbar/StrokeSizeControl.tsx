import { ChevronDown } from 'lucide-react';
import type { Tool } from '../../model/types';

type StrokeSizeControlProps = {
  tool: Tool;
  size: number;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (size: number) => void;
};

export function StrokeSizeControl({
  tool,
  size,
  open,
  disabled,
  onOpenChange,
  onChange,
}: StrokeSizeControlProps) {
  const label = tool === 'text' ? 'Dimensione testo' : 'Spessore';
  const min = tool === 'pen' ? 1 : tool === 'text' ? 12 : 8;
  const max = tool === 'pen' ? 12 : tool === 'text' ? 48 : tool === 'eraser' ? 80 : 64;
  const dotSize = Math.min(10, Math.max(3, size / 2));

  return (
    <div className="size-control">
      <button
        className="size-button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        <span className="size-dot" style={{ width: dotSize, height: dotSize }} />
        <span>
          {size}
          <small> px</small>
        </span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="size-popover">
          <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            value={size}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </div>
      )}
    </div>
  );
}
