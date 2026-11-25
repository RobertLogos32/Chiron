import { useCallback, type RefObject } from 'react';
import type Konva from 'konva';
import { noteBounds } from '../lib/geometry';
import type { Bounds, Note } from '../model/types';

export function useMeasuredBounds(stageRef: RefObject<Konva.Stage | null>) {
  return useCallback(
    (note: Note): Bounds => {
      const node = stageRef.current?.findOne(`#note-${note.id}`);
      if (note.type !== 'text' || node?.getClassName() !== 'Text')
        return noteBounds(note);
      const text = node as Konva.Text;
      return {
        x: note.x,
        y: note.y,
        width: Math.max(1, Math.min(text.width(), text.getTextWidth())),
        height: text.height(),
      };
    },
    [stageRef],
  );
}
