import type { KeyboardEvent, RefObject } from 'react';
import { NOTE_FONT } from '../../config/defaults';
import { inkColor } from '../../model/appearance';
import type { Camera, TextDraft, Theme } from '../../model/types';

export type TextEditorController = {
  draft: TextDraft | null;
  ref: RefObject<HTMLTextAreaElement | null>;
  change: (text: string) => void;
  save: () => void;
  cancel: () => void;
};

type TextEditorProps = {
  editor: TextEditorController;
  camera: Camera;
  theme: Theme;
};

export function TextEditor({ editor, camera, theme }: TextEditorProps) {
  const { draft } = editor;
  if (!draft) return null;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.cancel();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      editor.save();
    }
  }

  return (
    <textarea
      ref={editor.ref}
      className="text-editor"
      aria-label="Scrivi un appunto"
      placeholder="Scrivi…"
      value={draft.text}
      maxLength={20000}
      style={{
        left: draft.x * camera.zoom + camera.x,
        top: draft.y * camera.zoom + camera.y,
        width: (draft.width ?? 600) * camera.zoom,
        fontSize: draft.fontSize * camera.zoom,
        fontFamily: NOTE_FONT,
        color: inkColor(draft.color, theme),
      }}
      onChange={(event) => editor.change(event.target.value)}
      onBlur={editor.save}
      onKeyDown={onKeyDown}
    />
  );
}
