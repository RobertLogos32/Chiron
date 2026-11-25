import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { zoomCamera } from '@whiteboard/lib/geometry';
import type { Camera, Point, Size } from '@whiteboard/model/types';
import { clampPageCamera, fitPageCamera } from '../lib/pageCamera';

export function usePdfCamera(page: Size, viewport: Size, pageNumber: number) {
  const [camera, updateCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  // All movements, including hand gestures and zoom anchors, share the same limits.
  const setCamera: Dispatch<SetStateAction<Camera>> = useCallback(
    (update) => {
      updateCamera((previous) =>
        clampPageCamera(
          typeof update === 'function' ? update(previous) : update,
          page,
          viewport,
        ),
      );
    },
    [page.width, page.height, viewport.width, viewport.height],
  );
  const fit = useCallback(
    (mode: 'page' | 'width' = 'page') => setCamera(fitPageCamera(page, viewport, mode)),
    [page, viewport, setCamera],
  );

  useEffect(() => {
    setCamera(fitPageCamera(page, viewport, 'width'));
  }, [page.width, page.height, viewport.width, viewport.height, pageNumber, setCamera]);

  const changeZoom = (value: number | ((zoom: number) => number), anchor?: Point) => {
    setCamera((previous) =>
      zoomCamera(
        previous,
        typeof value === 'function' ? value(previous.zoom) : value,
        anchor ?? { x: viewport.width / 2, y: viewport.height / 2 },
      ),
    );
  };
  const panBy = (delta: Point) =>
    setCamera((previous) => ({
      ...previous,
      x: previous.x + delta.x,
      y: previous.y + delta.y,
    }));

  return { camera, setCamera, changeZoom, panBy, fit };
}
