import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { loadCamera } from '../services/storage';
import { zoomCamera } from '../lib/geometry';
import { clampBoardCamera } from '../lib/boardBounds';
import type { Camera, Point, Size } from '../model/types';

export function useBoardCamera(viewport: Size, documentId?: string) {
  const [camera, updateCamera] = useState(() => clampBoardCamera(loadCamera(documentId)));
  const setCamera: Dispatch<SetStateAction<Camera>> = useCallback((update) => {
    updateCamera((previous) => {
      const next = clampBoardCamera(
        typeof update === 'function' ? update(previous) : update,
      );
      return next.x === previous.x && next.y === previous.y && next.zoom === previous.zoom
        ? previous
        : next;
    });
  }, []);

  const changeZoom = useCallback(
    (value: number | ((zoom: number) => number), anchor?: Point) => {
      setCamera((previous) =>
        zoomCamera(
          previous,
          typeof value === 'function' ? value(previous.zoom) : value,
          anchor ?? { x: viewport.width / 2, y: viewport.height / 2 },
        ),
      );
    },
    [viewport, setCamera],
  );

  const panBy = (delta: Point) =>
    setCamera((previous) => ({
      ...previous,
      x: previous.x + delta.x,
      y: previous.y + delta.y,
    }));

  return { camera, setCamera, changeZoom, panBy };
}
