import { WhiteboardCanvas } from '../features/whiteboard/components/canvas/WhiteboardCanvas';
import { BoardSettings } from '../features/whiteboard/components/settings/BoardSettings';
import { WhiteboardToolbar } from '../features/whiteboard/components/toolbar/WhiteboardToolbar';
import { AiPrompt } from '../features/whiteboard/components/ai/AiPrompt';
import { useWhiteboard } from '../features/whiteboard/hooks/useWhiteboard';
import { captureAiSelection } from '../features/whiteboard/lib/captureAiSelection';
import '../features/whiteboard/styles/index.css';

export function WhiteboardPage({
  documentId,
  active = true,
  paneId,
}: { documentId?: string; active?: boolean; paneId?: string } = {}) {
  const board = useWhiteboard({ documentId, active, paneId });
  const { scene, appearance, selection } = board;

  return (
    <main className={`whiteboard theme-${appearance.theme} tool-${scene.tool}`}>
      <WhiteboardCanvas
        scene={scene}
        surface={board.surface}
        editor={board.editor}
        pattern={appearance.pattern}
        selection={selection}
      />
      {selection.aiArea && (
        <AiPrompt
          area={selection.aiArea}
          camera={scene.camera}
          anchor={board.surface.workspaceRef}
          theme={appearance.theme}
          active={active}
          context="notebook"
          onClose={board.closeAi}
          onSend={({ selection, prompt }) => {
            const capture = captureAiSelection(
              board.surface.stageRef.current,
              board.surface.workspaceRef.current,
              selection,
              scene.camera,
              { pattern: appearance.pattern },
            );
            board.ai.submit(capture.area, prompt, capture);
          }}
        />
      )}
      <BoardSettings
        pattern={appearance.pattern}
        zoom={scene.camera.zoom}
        onPatternChange={appearance.setPattern}
        onZoomChange={board.changeZoom}
      />
      {active && (
        <WhiteboardToolbar
          tools={board.tools}
          theme={appearance.theme}
          selection={selection}
          history={board.history}
        />
      )}
      {board.saveError && (
        <div className="save-error" role="status">
          Memoria del browser piena: gli ultimi appunti non sono salvati.
        </div>
      )}
    </main>
  );
}
