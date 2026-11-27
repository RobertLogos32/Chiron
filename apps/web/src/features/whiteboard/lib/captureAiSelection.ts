import type Konva from 'konva';
import { PATTERN_PERIOD } from '../config/defaults';
import type { Bounds, Camera, Pattern, Size } from '../model/types';
import type { AiCapture } from '../model/ai';
import { rectangle, screenToWorld } from './geometry';
import { createAiGuide } from './createAiGuide';

type SurfaceContent = { pattern: Pattern } | { pdf: HTMLCanvasElement; size: Size };

export function captureAiSelection(
  stage: Konva.Stage | null,
  workspace: HTMLDivElement | null,
  area: Bounds,
  camera: Camera,
  content: SurfaceContent,
): AiCapture & { area: Bounds } {
  if (!stage || !workspace) throw new Error('Surface is not ready');

  const left = camera.x + area.x * camera.zoom;
  const top = camera.y + area.y * camera.zoom;
  const x = Math.max(0, left);
  const y = Math.max(0, top);
  const width = Math.min(stage.width(), left + area.width * camera.zoom) - x;
  const height = Math.min(stage.height(), top + area.height * camera.zoom) - y;
  if (width <= 0 || height <= 0) throw new Error('Selection is outside the surface');

  const density = Math.min(
    window.devicePixelRatio || 1,
    2,
    1536 / Math.max(width, height),
  );
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(width * density));
  output.height = Math.max(1, Math.round(height * density));
  const ctx = output.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas capture is unavailable');
  const scaleX = output.width / width;
  const scaleY = output.height / height;
  ctx.setTransform(scaleX, 0, 0, scaleY, -x * scaleX, -y * scaleY);

  const foreground = document.createElement('canvas');
  foreground.width = output.width;
  foreground.height = output.height;
  const ink = foreground.getContext('2d');
  ink?.setTransform(scaleX, 0, 0, scaleY, -x * scaleX, -y * scaleY);

  const style = getComputedStyle(workspace);
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(x, y, width, height);
  if ('pdf' in content) {
    const pageWidth = content.size.width * camera.zoom;
    const pageHeight = content.size.height * camera.zoom;
    ctx.fillStyle = style.getPropertyValue('--pdf-paper').trim() || '#fff';
    ctx.fillRect(camera.x, camera.y, pageWidth, pageHeight);
    ctx.drawImage(content.pdf, camera.x, camera.y, pageWidth, pageHeight);
    ink?.drawImage(content.pdf, camera.x, camera.y, pageWidth, pageHeight);
  } else if (content.pattern !== 'blank') {
    drawPattern(ctx, { x, y, width, height }, camera, content.pattern, style);
  }

  // Composite only the document layers, keeping the selection and controls out of the image.
  for (const layer of stage.getLayers()) {
    if (!layer.hasName('capture-ink')) continue;
    layer.drawScene();
    const canvas = layer.getNativeCanvasElement();
    ctx.globalCompositeOperation =
      getComputedStyle(canvas).mixBlendMode === 'multiply' ? 'multiply' : 'source-over';
    ctx.drawImage(canvas, 0, 0, stage.width(), stage.height());
    if (layer.hasName('capture-foreground')) {
      ink?.drawImage(canvas, 0, 0, stage.width(), stage.height());
    }
  }
  return {
    image: output.toDataURL('image/png'),
    guide: ink ? createAiGuide(output, ink, 'pdf' in content) : undefined,
    area: rectangle(
      screenToWorld({ x, y }, camera),
      screenToWorld({ x: x + width, y: y + height }, camera),
    ),
  };
}

function drawPattern(
  ctx: CanvasRenderingContext2D,
  crop: Bounds,
  camera: Camera,
  pattern: Exclude<Pattern, 'blank'>,
  style: CSSStyleDeclaration,
) {
  const period = PATTERN_PERIOD[pattern] * camera.zoom;
  const offset = pattern === 'dots' ? period / 2 : 0;
  const originX = camera.x + offset;
  const originY = camera.y + offset;
  const firstX = originX + Math.floor((crop.x - originX) / period) * period;
  const firstY = originY + Math.floor((crop.y - originY) / period) * period;
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  ctx.fillStyle = style
    .getPropertyValue(pattern === 'dots' ? '--dots' : '--lines')
    .trim();
  for (let y = firstY; y < bottom + 1; y += period) {
    if (pattern === 'dots') {
      for (let x = firstX; x < right + 1; x += period) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, 2 * Math.PI);
        ctx.fill();
      }
    } else {
      ctx.fillRect(crop.x, y, crop.width, 1);
    }
  }
  if (pattern === 'grid') {
    for (let x = firstX; x < right; x += period) {
      ctx.fillRect(x, crop.y, 1, crop.height);
    }
  }
}
