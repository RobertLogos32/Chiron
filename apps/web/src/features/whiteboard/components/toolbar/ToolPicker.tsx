import { TOOLS } from '../../config/tools';
import type { Tool } from '../../model/types';

type ToolPickerProps = { value: Tool; onChange: (tool: Tool) => void };

export function ToolPicker({ value, onChange }: ToolPickerProps) {
  return (
    <div className="tool-group drawing-tools">
      {TOOLS.map(({ id, label, shortcut, icon: Icon }) => (
        <button
          key={id}
          className={`tool-button ${value === id ? 'is-selected' : ''}`}
          aria-label={label}
          aria-pressed={value === id}
          title={`${label} (${shortcut})`}
          onClick={() => onChange(id)}
        >
          <Icon size={21} strokeWidth={1.7} />
        </button>
      ))}
    </div>
  );
}
