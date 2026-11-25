import { Sparkles, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Bounds, Theme, Tool } from '../../model/types';
import { ToolPicker } from './ToolPicker';
import { ColorPalette } from './ColorPalette';
import { StrokeSizeControl } from './StrokeSizeControl';
import { HistoryControls, type HistoryControlsProps } from './HistoryControls';

type ToolbarTools = {
  tool: Tool;
  color: string;
  size: number;
  colorsDisabled: boolean;
  sizeDisabled: boolean;
  sizeOpen: boolean;
  selectTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  setSizeOpen: (open: boolean) => void;
};
type ToolbarSelection = {
  count: number;
  aiArea: Bounds | null;
  marquee: Bounds | null;
  deleteSelected: () => void;
};
type WhiteboardToolbarProps = {
  tools: ToolbarTools;
  theme: Theme;
  colorTheme?: Theme;
  selection: ToolbarSelection;
  history: HistoryControlsProps;
};

export function WhiteboardToolbar({
  tools,
  theme,
  colorTheme = theme,
  selection,
  history,
}: WhiteboardToolbarProps) {
  const showAiHint = tools.tool === 'ai' && !selection.aiArea && !selection.marquee;
  const showColors = !tools.colorsDisabled;
  const showSize = !tools.sizeDisabled;
  const sizeOpen = showSize && tools.sizeOpen;

  return (
    <>
      <div className="toolbar-dock">
        {showAiHint && (
          <div className="ai-selection-hint" role="status">
            <Sparkles size={14} />
            <span>Trascina per selezionare un’area</span>
          </div>
        )}
        {selection.count > 0 && (
          <div className="selection-actions" role="status">
            <span>
              {selection.count} {selection.count === 1 ? 'elemento' : 'elementi'}
            </span>
            <kbd>Canc</kbd>
            <button
              aria-label="Elimina selezione"
              title="Elimina selezione (Canc)"
              onClick={selection.deleteSelected}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <div
          className="toolbar toolbar-contextual"
          role="toolbar"
          aria-label="Strumenti di scrittura"
        >
          <ToolPicker value={tools.tool} onChange={tools.selectTool} />
          <div className="toolbar-options">
            <ToolbarOption visible={showColors} name="colors">
              <span className="divider" aria-hidden="true" />
              <ColorPalette
                color={tools.color}
                theme={colorTheme}
                disabled={tools.colorsDisabled}
                onChange={tools.setColor}
              />
            </ToolbarOption>
            <ToolbarOption visible={showSize} name="size" popoverOpen={sizeOpen}>
              <span className="divider" aria-hidden="true" />
              <StrokeSizeControl
                tool={tools.tool}
                size={tools.size}
                open={sizeOpen}
                disabled={tools.sizeDisabled}
                onOpenChange={tools.setSizeOpen}
                onChange={tools.setSize}
              />
            </ToolbarOption>
            <div className="toolbar-history">
              <span className="divider" aria-hidden="true" />
              <HistoryControls {...history} />
            </div>
          </div>
        </div>
      </div>
      {sizeOpen && (
        <button
          className="dismiss-popover"
          aria-label="Chiudi spessore"
          onClick={() => tools.setSizeOpen(false)}
        />
      )}
    </>
  );
}

function ToolbarOption({
  visible,
  name,
  popoverOpen = false,
  children,
}: {
  visible: boolean;
  name: string;
  popoverOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`toolbar-option toolbar-option-${name}${visible ? '' : ' is-collapsed'}${popoverOpen ? ' is-popover-open' : ''}`}
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className="toolbar-option-clip">
        <div className="toolbar-option-content">{children}</div>
      </div>
    </div>
  );
}
