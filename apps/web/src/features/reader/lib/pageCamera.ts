import type { Camera, Size } from '@whiteboard/model/types';

const PAGE_MARGIN = 24;

function pageArea(viewport: Size) {
  const top = viewport.width <= 760 ? 112 : 78;
  const bottom = viewport.width <= 760 ? 138 : 92;
  return {
    x: PAGE_MARGIN,
    y: top,
    width: Math.max(1, viewport.width - PAGE_MARGIN * 2),
    height: Math.max(1, viewport.height - top - bottom - 20),
  };
}

function boundedOffset(value: number, content: number, start: number, available: number) {
  if (content <= available) return start + (available - content) / 2;
  return Math.max(start + available - content, Math.min(start, value));
}

export function clampPageCamera(camera: Camera, page: Size, viewport: Size): Camera {
  const area = pageArea(viewport);
  return {
    ...camera,
    x: boundedOffset(camera.x, page.width * camera.zoom, area.x, area.width),
    y: boundedOffset(camera.y, page.height * camera.zoom, area.y, area.height),
  };
}

export function fitPageCamera(
  page: Size,
  viewport: Size,
  mode: 'page' | 'width',
): Camera {
  const area = pageArea(viewport);
  const widthZoom = Math.min(1, area.width / Math.max(1, page.width));
  const pageZoom = Math.min(widthZoom, area.height / Math.max(1, page.height));
  const zoom = Math.max(0.25, Math.min(4, mode === 'width' ? widthZoom : pageZoom));
  return clampPageCamera(
    { x: (viewport.width - page.width * zoom) / 2, y: area.y, zoom },
    page,
    viewport,
  );
}

export function boundedPage(value: number, count: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(1, Math.trunc(count)), Math.max(1, Math.trunc(value)));
}
