import type { AiJob, AiTarget } from '../model/ai';
import type { Bounds, Camera, Size } from '../model/types';

export type AiView = { scope: string; camera: Camera; pane: Bounds; target?: AiTarget };
export type AiDirection = 'up' | 'down';
export type AiCursor = { id: string | null; direction: AiDirection };

const pageTop = (target?: AiTarget) =>
  target?.kind === 'pdf' ? ((target.page ?? 1) - 1) * (target.pageHeight ?? 842) : 0;
const resultTop = (job: AiJob) => pageTop(job.target) + job.area.y;

export function advanceAiRequest(
  jobs: AiJob[],
  views: AiView[],
  cursor: AiCursor,
  requestedDirection?: AiDirection,
): { job: AiJob; cursor: AiCursor } | undefined {
  const ordered = jobs
    .filter((job) => job.status === 'pending')
    .sort(
      (a, b) =>
        resultTop(a) - resultTop(b) ||
        Number(a.target?.kind !== 'pdf') - Number(b.target?.kind !== 'pdf') ||
        a.area.x - b.area.x,
    );
  if (!ordered.length) return;
  let direction = requestedDirection ?? cursor.direction;
  const index = ordered.findIndex((job) => job.id === cursor.id);
  if (index >= 0) {
    let next = index + (direction === 'up' ? -1 : 1);
    if (next < 0 || next >= ordered.length) {
      direction = direction === 'up' ? 'down' : 'up';
      next = index + (direction === 'up' ? -1 : 1);
    }
    const job = ordered[Math.max(0, Math.min(ordered.length - 1, next))];
    return { job, cursor: { id: job.id, direction } };
  }

  // Begin with the closest result above the current view. Thereafter the
  // stable document order drives navigation, not the camera movement we cause.
  const distances = ordered.flatMap((job) => {
    const view =
      views.find((item) => item.scope === job.scope) ??
      views.find(
        (item) =>
          job.target &&
          item.target?.resourceId === job.target.resourceId &&
          item.target.kind === job.target.kind,
      );
    if (!view || view.pane.width <= 0 || view.pane.height <= 0 || view.camera.zoom <= 0)
      return [];
    const center =
      pageTop(view.target) + (view.pane.height / 2 - view.camera.y) / view.camera.zoom;
    return [
      { job, delta: (resultTop(job) + job.area.height / 2 - center) * view.camera.zoom },
    ];
  });
  let candidates = distances.filter((item) =>
    direction === 'up' ? item.delta <= 0 : item.delta >= 0,
  );
  if (!candidates.length && distances.length) {
    direction = direction === 'up' ? 'down' : 'up';
    candidates = distances.filter((item) =>
      direction === 'up' ? item.delta <= 0 : item.delta >= 0,
    );
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  const job = candidates[0]?.job ?? ordered[0];
  return { job, cursor: { id: job.id, direction } };
}

export function revealAiCamera(area: Bounds, camera: Camera, viewport: Size): Camera {
  const availableWidth = Math.max(92, viewport.width - 96);
  const availableHeight = Math.max(60, viewport.height - 200);
  const zoom = Math.max(
    0.93,
    Math.min(
      Math.max(1, camera.zoom),
      availableWidth / Math.max(1, area.width),
      availableHeight / Math.max(1, area.height),
    ),
  );
  return {
    zoom,
    x: viewport.width / 2 - (area.x + area.width / 2) * zoom,
    y: Math.max(50, (viewport.height - 100) / 2) - (area.y + area.height / 2) * zoom,
  };
}
