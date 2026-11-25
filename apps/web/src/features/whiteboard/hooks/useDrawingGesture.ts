import { useState } from 'react';
import type { CommitNotes, Point, PointerGesture, Stroke } from '../model/types';

export function useDrawingGesture(commit: CommitNotes, zoom: number) {
  const [draft, setDraft] = useState<Stroke | null>(null);

  function begin(
    point: Point,
    tool: Stroke['tool'],
    color: string,
    width: number,
  ): PointerGesture {
    let stroke: Stroke = {
      id: crypto.randomUUID(),
      type: 'stroke',
      tool,
      color,
      width,
      points: [point.x, point.y, point.x + 0.01, point.y],
    };
    setDraft(stroke);

    return {
      move(next, event) {
        const last = stroke.points.length - 2;
        const distance = Math.hypot(
          next.x - stroke.points[last],
          next.y - stroke.points[last + 1],
        );
        if (distance < 0.7 / zoom) return;

        const horizontal = stroke.tool === 'highlighter' && event.shiftKey;
        const points = horizontal
          ? [stroke.points[0], stroke.points[1], next.x, stroke.points[1]]
          : [...stroke.points, next.x, next.y];
        stroke = { ...stroke, points };
        setDraft(stroke);
      },
      finish() {
        setDraft(null);
        commit((notes) => [...notes, stroke]);
      },
    };
  }

  return { draft, begin };
}
