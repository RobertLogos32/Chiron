import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cutStroke,
  eraseNotes,
  noteIntersects,
  rectangle,
  screenToWorld,
  zoomCamera,
} from '../src/features/whiteboard/lib/geometry.ts';

const stroke = (points, width = 2) => ({
  id: 'ink',
  type: 'stroke',
  tool: 'pen',
  color: '#303749',
  width,
  points,
});
const almost = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`);

test('the eraser splits a sparse stroke even when neither endpoint is touched', () => {
  const original = stroke([0, 0, 100, 0]);
  const pieces = cutStroke(original, { x: 50, y: 0 }, { x: 50, y: 0 }, 10);
  assert.equal(pieces.length, 2);
  almost(pieces[0].points.at(-2), 39);
  almost(pieces[1].points[0], 61);
  assert.notEqual(pieces[0].id, pieces[1].id);
  assert.deepEqual(original.points, [0, 0, 100, 0]);
});

test('a fast eraser sweep cuts the path between pointer events', () => {
  const pieces = cutStroke(
    stroke([0, 0, 100, 0]),
    { x: 50, y: -100 },
    { x: 50, y: 100 },
    10,
  );
  assert.equal(pieces.length, 2);
  almost(pieces[0].points.at(-2), 39);
  almost(pieces[1].points[0], 61);
});

test('an oblique eraser leaves untouched ink inside its bounding rectangle intact', () => {
  const original = stroke([0, 80, 10, 80]);
  assert.equal(cutStroke(original, { x: 0, y: 0 }, { x: 100, y: 100 }, 2)[0], original);
});

test('an eraser pass can remove a dot and a whole text without touching distant content', () => {
  const dot = stroke([5, 5, 5.01, 5.01]);
  const text = {
    id: 'text',
    type: 'text',
    x: 0,
    y: 0,
    text: 'hello',
    color: '#303749',
    fontSize: 24,
  };
  const distant = { ...stroke([500, 500, 550, 550]), id: 'distant' };
  const notes = [dot, text, distant];
  assert.deepEqual(eraseNotes(notes, { x: 5, y: 5 }, { x: 5, y: 5 }, 20), [distant]);
  assert.equal(eraseNotes(notes, { x: -100, y: -100 }, { x: -90, y: -90 }, 5), notes);
});

test('a selection rectangle does not select a diagonal merely because their bounds overlap', () => {
  const diagonal = stroke([0, 0, 100, 100]);
  assert.equal(noteIntersects(diagonal, { x: 0, y: 80, width: 10, height: 10 }), false);
  assert.equal(noteIntersects(diagonal, { x: 45, y: 45, width: 10, height: 10 }), true);
});

test('selection works when dragged backwards across negative board coordinates', () => {
  const area = rectangle({ x: 10, y: 20 }, { x: -100, y: -80 });
  assert.deepEqual(area, { x: -100, y: -80, width: 110, height: 100 });
  assert.equal(noteIntersects(stroke([-50, -50, -20, -20]), area), true);
});

test('zoom keeps the same board point below the pointer and respects both limits', () => {
  const camera = { x: -130, y: 75, zoom: 0.8 };
  const pointer = { x: 320, y: 240 };
  const before = screenToWorld(pointer, camera);
  for (const zoom of [2, 100, 0.001]) {
    const next = zoomCamera(camera, zoom, pointer);
    const after = screenToWorld(pointer, next);
    almost(after.x, before.x);
    almost(after.y, before.y);
    assert.ok(next.zoom >= 0.25 && next.zoom <= 4);
  }
});
