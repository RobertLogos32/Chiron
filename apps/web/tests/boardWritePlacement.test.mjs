import assert from 'node:assert/strict';
import test from 'node:test';
import { boardWriteSpaces } from '../src/features/whiteboard/lib/boardWritePlacement.ts';
import { overlaps } from '../src/features/whiteboard/lib/geometry.ts';

test('trova una colonna libera dentro la selezione accanto a un appunto', () => {
  const selection = { x: 100, y: 100, width: 320, height: 240 };
  const existing = { x: 100, y: 100, width: 150, height: 240 };
  const spaces = boardWriteSpaces(selection, [existing], { width: 100, height: 100 });
  assert.deepEqual(spaces, [{ x: 258, y: 108, width: 154, height: 224 }]);
});

test('gli spazi candidati restano interni e separati da tutti gli oggetti', () => {
  const selection = { x: 100, y: 120, width: 410, height: 270 };
  const occupied = [
    { x: 45, y: 151, width: 145, height: 90 },
    { x: 230, y: 202, width: 125, height: 210 },
    { x: 440, y: 160, width: 200, height: 30 },
  ];
  const spaces = boardWriteSpaces(selection, occupied, { width: 40, height: 40 });
  assert.ok(spaces.length > 1);
  for (const space of spaces) {
    assert.ok(space.x >= selection.x && space.y >= selection.y);
    assert.ok(space.x + space.width <= selection.x + selection.width);
    assert.ok(space.y + space.height <= selection.y + selection.height);
    assert.ok(occupied.every((item) => !overlaps(space, item)));
  }
});

test('scrivere sotto dà precedenza alla parte bassa della selezione', () => {
  const selection = { x: 100, y: 100, width: 400, height: 400 };
  const existing = { x: 100, y: 240, width: 400, height: 60 };
  const size = { width: 100, height: 80 };
  const [below] = boardWriteSpaces(selection, [existing], size, 'below');
  assert.equal(below.y, 308);
  assert.ok(below.y + below.height <= 500);
});

test('una selezione troppo stretta o coperta non produce uno spazio esterno', () => {
  const selection = { x: 45, y: 90, width: 190, height: 85 };
  const size = { width: 100, height: 60 };
  assert.deepEqual(boardWriteSpaces(selection, [selection], size), []);
  assert.deepEqual(boardWriteSpaces({ ...selection, width: 95 }, [], size), []);
});
