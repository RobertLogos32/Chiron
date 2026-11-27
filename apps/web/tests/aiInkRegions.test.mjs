import assert from 'node:assert/strict';
import test from 'node:test';
import { findInkRegions } from '../src/features/whiteboard/lib/findInkRegions.ts';

function raster(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    pixels: { data, width, height },
    fill(x, y, w, h, shade = 255) {
      for (let row = y; row < y + h; row++) {
        for (let col = x; col < x + w; col++) {
          data.set([shade, shade, shade, 255], (row * width + col) * 4);
        }
      }
    },
  };
}

test('i riquadri seguono i pixel di ciascun simbolo, anche con molto margine sopra la formula', () => {
  const { pixels, fill } = raster(180, 100);
  fill(16, 68, 14, 22);
  fill(42, 69, 11, 20);
  fill(65, 76, 13, 4);
  fill(91, 67, 18, 23);
  fill(119, 75, 12, 2);
  fill(119, 81, 12, 2);
  fill(149, 69, 12, 20);
  assert.deepEqual(findInkRegions(pixels, false), [
    { x: 16, y: 68, width: 14, height: 22 },
    { x: 42, y: 69, width: 11, height: 20 },
    { x: 65, y: 76, width: 13, height: 4 },
    { x: 91, y: 67, width: 18, height: 23 },
    { x: 119, y: 75, width: 12, height: 8 },
    { x: 149, y: 69, width: 12, height: 20 },
  ]);
});

test('il rilevamento conserva le righe separate e ignora la carta e il margine del PDF', () => {
  const { pixels, fill } = raster(80, 100);
  fill(12, 0, 60, 100);
  fill(18, 18, 7, 9, 40);
  fill(28, 19, 8, 7, 60);
  fill(16, 68, 8, 9, 30);
  fill(39, 67, 9, 13, 40);
  assert.deepEqual(findInkRegions(pixels, true), [
    { x: 18, y: 18, width: 7, height: 9 },
    { x: 28, y: 19, width: 8, height: 7 },
    { x: 16, y: 68, width: 8, height: 9 },
    { x: 39, y: 67, width: 9, height: 13 },
  ]);
  assert.deepEqual(findInkRegions(raster(10, 10).pixels, false), []);
});
