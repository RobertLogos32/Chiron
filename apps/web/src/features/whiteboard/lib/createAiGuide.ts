import type { AiCapture } from '../model/ai';
import { findInkRegions } from './findInkRegions';

export function createAiGuide(
  screenshot: HTMLCanvasElement,
  ink: CanvasRenderingContext2D,
  pdf: boolean,
): AiCapture['guide'] {
  const { width, height } = screenshot;
  const regions = findInkRegions(ink.getImageData(0, 0, width, height), pdf);
  if (!regions.length) return undefined;

  const tileWidth = 78;
  const tileHeight = 68;
  const columns = Math.min(8, regions.length);
  const guide = document.createElement('canvas');
  guide.width = columns * tileWidth;
  guide.height = Math.ceil(regions.length / columns) * tileHeight;
  const ctx = guide.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, guide.width, guide.height);
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';

  regions.forEach((region, index) => {
    const x = (index % columns) * tileWidth;
    const y = Math.floor(index / columns) * tileHeight;
    const scale = Math.min((tileWidth - 12) / region.width, 36 / region.height);
    const w = region.width * scale;
    const h = region.height * scale;
    ctx.strokeStyle = '#c5cbd5';
    ctx.strokeRect(x + 1, y + 1, tileWidth - 2, tileHeight - 2);
    ctx.fillStyle = '#182642';
    ctx.fillText(String(index + 1), x + tileWidth / 2, y + 17);
    ctx.drawImage(
      screenshot,
      region.x,
      region.y,
      region.width,
      region.height,
      x + (tileWidth - w) / 2,
      y + 23 + (36 - h) / 2,
      w,
      h,
    );
  });

  return {
    image: guide.toDataURL('image/png'),
    regions: regions.map((region) => ({
      left: Math.floor((region.x * 1000) / width),
      top: Math.floor((region.y * 1000) / height),
      right: Math.ceil(((region.x + region.width) * 1000) / width),
      bottom: Math.ceil(((region.y + region.height) * 1000) / height),
    })),
  };
}
