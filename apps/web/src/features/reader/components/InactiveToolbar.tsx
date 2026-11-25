import { WhiteboardToolbar } from '@whiteboard/components/toolbar/WhiteboardToolbar';
import type { useDrawingTools } from '@whiteboard/hooks/useDrawingTools';
import type { Theme } from '@whiteboard/model/types';

const noop = () => {};
const emptySelection = { count: 0, aiArea: null, marquee: null, deleteSelected: noop };
const emptyHistory = { canUndo: false, canRedo: false, undo: noop, redo: noop };

export function InactiveToolbar({
  tools,
  theme,
}: {
  tools: ReturnType<typeof useDrawingTools>;
  theme: Theme;
}) {
  return (
    <div className="pdf-inactive-toolbar" inert aria-hidden="true">
      <WhiteboardToolbar
        tools={{ ...tools, sizeOpen: false, selectTool: noop }}
        theme={theme}
        colorTheme="light"
        selection={emptySelection}
        history={emptyHistory}
      />
    </div>
  );
}
