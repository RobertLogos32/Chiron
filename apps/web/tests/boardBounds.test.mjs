import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampBoardCamera,
  clampBoardPoint,
} from '../src/features/whiteboard/lib/boardBounds.ts';
import { zoomCamera, screenToWorld } from '../src/features/whiteboard/lib/geometry.ts';

test('la vista non può oltrepassare il bordo in alto e a sinistra', () => {
  assert.deepEqual(clampBoardCamera({ x: 1500, y: 900, zoom: 1 }), {
    x: 0,
    y: 0,
    zoom: 1,
  });
  assert.deepEqual(clampBoardCamera({ x: -400, y: 900, zoom: 2 }), {
    x: -400,
    y: 0,
    zoom: 2,
  });
  assert.deepEqual(clampBoardCamera({ x: 1500, y: -600, zoom: 0.5 }), {
    x: 0,
    y: -600,
    zoom: 0.5,
  });
});

test('lo spazio resta illimitato verso destra e in basso', () => {
  const camera = { x: -1_000_000, y: -2_000_000, zoom: 4 };
  assert.deepEqual(clampBoardCamera(camera), camera);
  assert.deepEqual(clampBoardPoint({ x: 1_000_000, y: 2_000_000 }), {
    x: 1_000_000,
    y: 2_000_000,
  });
});

test('ridurre lo zoom all’origine non apre uno spazio negativo', () => {
  const anchor = { x: 330, y: 260 };
  const reduced = clampBoardCamera(zoomCamera({ x: 0, y: 0, zoom: 1 }, 0.25, anchor));
  assert.deepEqual(reduced, { x: 0, y: 0, zoom: 0.25 });
  assert.deepEqual(screenToWorld({ x: 0, y: 0 }, reduced), { x: 0, y: 0 });
  const moved = { x: -1000, y: -900, zoom: 1 };
  const zoomed = clampBoardCamera(zoomCamera(moved, 2, anchor));
  assert.deepEqual(screenToWorld(anchor, zoomed), screenToWorld(anchor, moved));
});

test('i tratti e i testi trascinati non possono uscire dai bordi iniziali', () => {
  assert.deepEqual(clampBoardPoint({ x: -80, y: -30 }), { x: 0, y: 0 });
  assert.deepEqual(clampBoardPoint({ x: 250, y: -30 }), { x: 250, y: 0 });
  assert.deepEqual(clampBoardPoint({ x: -80, y: 500 }), { x: 0, y: 500 });
});
