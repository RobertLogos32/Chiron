import type { BoardWritePlacement, Bounds, Size } from '@whiteboard/model/types';

const CLEARANCE = 4;
// Brightness spread inside a cell that reveals text or a line, and the darkest background
// on which the AI ink stays readable.
const INK_CONTRAST = 32;
const LIGHT_BACKGROUND = 170;

export function pdfWriteSpace(
  page: Size,
  raster: Pick<ImageData, 'width' | 'height' | 'data'>,
  obstacles: Bounds[],
) {
  // Index page pixels and whole objects on a grid for fast rectangle queries.
  const columns = Math.min(300, Math.ceil(page.width / 4));
  const rows = Math.min(400, Math.ceil(page.height / 4));
  const cellWidth = page.width / columns;
  const cellHeight = page.height / rows;
  const occupied = new Uint8Array(columns * rows);
  const { width: pixelWidth, height: pixelHeight, data } = raster;
  const columnForPixel = Uint16Array.from({ length: pixelWidth }, (_, x) =>
    Math.floor((x * columns) / pixelWidth),
  );
  // A cell is taken by ink, not by colour: a light, uniform box such as «Una zona libera
  // per le tue idee» is free space, while text, lines and dark fills are not.
  const darkest = new Uint8Array(columns * rows).fill(255);
  const lightest = new Uint8Array(columns * rows);
  for (let y = 0; y < pixelHeight; y++) {
    const rowOffset = Math.floor((y * rows) / pixelHeight) * columns;
    for (let x = 0; x < pixelWidth; x++) {
      const i = (y * pixelWidth + x) * 4;
      const cell = rowOffset + columnForPixel[x];
      const light =
        data[i + 3] < 32
          ? 255
          : (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      if (light < darkest[cell]) darkest[cell] = light;
      if (light > lightest[cell]) lightest[cell] = light;
    }
  }
  for (let cell = 0; cell < occupied.length; cell++) {
    if (lightest[cell] - darkest[cell] > INK_CONTRAST || darkest[cell] < LIGHT_BACKGROUND)
      occupied[cell] = 1;
  }
  for (const item of obstacles) {
    const left = Math.max(0, Math.floor(item.x / cellWidth));
    const top = Math.max(0, Math.floor(item.y / cellHeight));
    const right = Math.min(columns, Math.ceil((item.x + item.width) / cellWidth));
    const bottom = Math.min(rows, Math.ceil((item.y + item.height) / cellHeight));
    if (left >= right || top >= bottom) continue;
    for (let y = top; y < bottom; y++)
      occupied.fill(1, y * columns + left, y * columns + right);
  }
  const stride = columns + 1;
  const integral = new Uint32Array(stride * (rows + 1));
  for (let y = 1; y <= rows; y++) {
    let count = 0;
    for (let x = 1; x <= columns; x++) {
      count += occupied[(y - 1) * columns + x - 1];
      integral[y * stride + x] = count + integral[(y - 1) * stride + x];
    }
  }

  return (selection: Bounds, size: Size, placement?: BoardWritePlacement) => {
    const width = Math.ceil((size.width + 2 * CLEARANCE) / cellWidth);
    const height = Math.ceil((size.height + 2 * CLEARANCE) / cellHeight);
    const right = selection.x + selection.width;
    const bottom = selection.y + selection.height;
    let nearest: { x: number; y: number; score: number } | undefined;
    for (let y = 0; y <= rows - height; y++) {
      const top = y * cellHeight + CLEARANCE;
      if (placement === 'below' && top < bottom) continue;
      const dy = Math.max(top - bottom, selection.y - top - size.height, 0);
      for (let x = 0; x <= columns - width; x++) {
        const start = y * stride + x;
        const end = start + height * stride;
        if (
          integral[end + width] -
          integral[end] -
          integral[start + width] +
          integral[start]
        )
          continue;
        const left = x * cellWidth + CLEARANCE;
        const dx = Math.max(left - right, selection.x - left - size.width, 0);
        const alignment = Math.abs(
          top + size.height / 2 - selection.y - selection.height / 2,
        );
        // A free selection large enough for the block keeps it inside its borders.
        const spill =
          Math.max(0, selection.x - left) +
          Math.max(0, left + size.width - right) +
          Math.max(0, selection.y - top) +
          Math.max(0, top + size.height - bottom);
        const score = Math.hypot(dx, dy) + alignment * 0.18 + spill * 0.25;
        if (!nearest || score < nearest.score) nearest = { x: left, y: top, score };
      }
    }
    return nearest;
  };
}

export function pdfImageBounds(coordinates: ArrayLike<number>, page: Size): Bounds[] {
  const bounds: Bounds[] = [];
  for (let i = 0; i + 5 < coordinates.length; i += 6) {
    // PDF.js records three corners of each image in normalized canvas coordinates.
    const [x0, y0, x1, y1, x2, y2] = Array.from(
      { length: 6 },
      (_, offset) => coordinates[i + offset],
    );
    const xs = [x0, x1, x2, x1 + x2 - x0];
    const ys = [y0, y1, y2, y1 + y2 - y0];
    const x = Math.min(...xs) * page.width;
    const y = Math.min(...ys) * page.height;
    const width = Math.max(...xs) * page.width - x;
    const height = Math.max(...ys) * page.height - y;
    // A full-page scan uses its visible ink to mark occupied space.
    if (width >= page.width * 0.95 && height >= page.height * 0.95) continue;
    if (width > 0 && height > 0) bounds.push({ x, y, width, height });
  }
  return bounds;
}
