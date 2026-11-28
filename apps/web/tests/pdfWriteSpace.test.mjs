import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pdfImageBounds,
  pdfWriteSpace,
} from '../src/features/annotations/lib/pdfWriteSpace.ts';
import { intersectBounds } from '../src/features/whiteboard/lib/aiAnnotations.ts';

function pageRaster(width, height, rules = []) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const y of rules) {
    for (let x = 0; x < width; x++) {
      data.set([136, 192, 134, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

test('le annotazioni AI trovano spazio accanto alla formula senza attraversare righe o oggetti', () => {
  const page = { width: 180, height: 96 };
  const selection = { x: 12, y: 42, width: 42, height: 10 };
  const size = { width: 34, height: 24 };
  const image = { x: 60, y: 28, width: 42, height: 36 };
  const annotation = { x: 116, y: 30, width: 20, height: 22 };
  const place = pdfWriteSpace(page, pageRaster(180, 96, [22, 72]), [
    selection,
    image,
    annotation,
  ]);
  const position = place(selection, size);
  assert.ok(position);
  assert.ok(position.y > 22 && position.y + size.height < 72);
  for (const occupied of [selection, image, annotation]) {
    assert.equal(intersectBounds({ ...position, ...size }, occupied), null);
  }
});

test('una pagina senza spazio tra le righe rifiuta la scrittura', () => {
  const page = { width: 120, height: 80 };
  const place = pdfWriteSpace(
    page,
    pageRaster(120, 80, [10, 20, 30, 40, 50, 60, 70]),
    [],
  );
  assert.equal(
    place({ x: 12, y: 12, width: 46, height: 7 }, { width: 40, height: 18 }),
    undefined,
  );
});

test('le immagini parziali riservano anche il loro interno', () => {
  assert.deepEqual(
    pdfImageBounds([0.25, 0.25, 0.25, 0.5, 0.75, 0.25], { width: 240, height: 120 }),
    [{ x: 60, y: 30, width: 120, height: 30 }],
  );
});

test('un riquadro con sfondo chiaro uniforme è spazio libero, il testo no', () => {
  const page = { width: 120, height: 80 };
  const raster = pageRaster(120, 80);
  // A light lavender box such as «Una zona libera per le tue idee».
  for (let y = 20; y < 70; y++)
    for (let x = 10; x < 110; x++)
      raster.data.set([240, 240, 250, 255], (y * 120 + x) * 4);
  const place = pdfWriteSpace(page, raster, []);
  const selection = { x: 10, y: 20, width: 100, height: 50 };
  const position = place(selection, { width: 60, height: 20 });
  assert.ok(position);
  assert.ok(
    position.x >= 10 &&
      position.x + 60 <= 110 &&
      position.y >= 20 &&
      position.y + 20 <= 70,
  );

  // The same box filled with dark ink is not usable.
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 120; x++) raster.data.set([30, 30, 40, 255], (y * 120 + x) * 4);
  assert.equal(
    pdfWriteSpace(page, raster, [])(selection, { width: 60, height: 20 }),
    undefined,
  );
});
