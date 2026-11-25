import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPageCamera,
  fitPageCamera,
  boundedPage,
} from '../src/features/reader/lib/pageCamera.ts';

test('adatta la pagina intera lasciando spazio ai controlli', () => {
  const page = { width: 595, height: 842 };
  const viewport = { width: 1280, height: 900 };
  const camera = fitPageCamera(page, viewport, 'page');
  assert.ok(camera.x >= 24);
  assert.ok(camera.y >= 78);
  assert.ok(camera.x + page.width * camera.zoom <= viewport.width - 24);
  assert.ok(camera.y + page.height * camera.zoom <= viewport.height - 92);
  assert.equal(camera.x, (viewport.width - page.width * camera.zoom) / 2);
});

test('la lettura a larghezza pagina si adatta anche allo schermo stretto', () => {
  const camera = fitPageCamera(
    { width: 595, height: 842 },
    { width: 390, height: 844 },
    'width',
  );
  assert.equal(camera.y, 112 + (574 - 842 * camera.zoom) / 2);
  assert.equal(camera.x, 24);
  assert.equal(camera.zoom, 342 / 595);
});

test('ferma lo spostamento sui quattro bordi di una pagina ingrandita', () => {
  const page = { width: 1000, height: 2000 };
  const viewport = { width: 1280, height: 900 };
  assert.deepEqual(clampPageCamera({ x: 100000, y: 100000, zoom: 2 }, page, viewport), {
    x: 24,
    y: 78,
    zoom: 2,
  });
  assert.deepEqual(clampPageCamera({ x: -100000, y: -100000, zoom: 2 }, page, viewport), {
    x: -744,
    y: -3212,
    zoom: 2,
  });
  assert.deepEqual(clampPageCamera({ x: -100, y: -200, zoom: 2 }, page, viewport), {
    x: -100,
    y: -200,
    zoom: 2,
  });
});

test('centra gli assi dove il foglio entra interamente nella finestra', () => {
  const page = { width: 595, height: 842 };
  const viewport = { width: 665, height: 524 };
  assert.deepEqual(clampPageCamera({ x: 100000, y: 100000, zoom: 1 }, page, viewport), {
    x: 35,
    y: 112,
    zoom: 1,
  });
  assert.deepEqual(clampPageCamera({ x: -100000, y: -100000, zoom: 1 }, page, viewport), {
    x: 35,
    y: -476,
    zoom: 1,
  });
  const reduced = clampPageCamera({ x: -100000, y: 100000, zoom: 0.25 }, page, viewport);
  assert.deepEqual(reduced, { x: 258.125, y: 133.75, zoom: 0.25 });
});

test('ricalcola i confini dopo zoom e ridimensionamento senza perdere il documento', () => {
  const page = { width: 595, height: 842 };
  const viewport = { width: 390, height: 844 };
  const atMaximum = clampPageCamera({ x: -9000, y: 9000, zoom: 4 }, page, viewport);
  assert.equal(atMaximum.x + page.width * atMaximum.zoom, 366);
  assert.equal(atMaximum.y, 112);
  const reduced = clampPageCamera({ ...atMaximum, zoom: 0.25 }, page, viewport);
  assert.ok(reduced.x >= 24 && reduced.y >= 112);
  assert.ok(reduced.x + page.width * reduced.zoom <= 366);
  assert.ok(reduced.y + page.height * reduced.zoom <= 686);
});

test('limita il numero pagina ai confini del documento', () => {
  assert.equal(boundedPage(-4, 10), 1);
  assert.equal(boundedPage(999, 10), 10);
  assert.equal(boundedPage(3.8, 10), 3);
  assert.equal(boundedPage(NaN, 10), 1);
  assert.equal(boundedPage(Infinity, 10), 1);
});
