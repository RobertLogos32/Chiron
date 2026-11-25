import test from 'node:test';
import assert from 'node:assert/strict';
import { positionPrompt } from '../src/features/whiteboard/lib/getPromptPosition.ts';

const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const camera = { x: 0, y: 0, zoom: 1 };

test('la barra può attraversare il divisore senza coprire una selezione a sinistra o a destra', () => {
  const viewport = { width: 1275, height: 524 };
  for (const area of [
    { x: 450, y: 120, width: 150, height: 160 },
    { x: 650, y: 120, width: 160, height: 160 },
  ]) {
    const bar = {
      ...positionPrompt(area, camera, viewport, 420, 54),
      width: 420,
      height: 54,
    };
    assert.equal(overlap(bar, area), 0);
    assert.ok(bar.x < viewport.width / 2 && bar.x + bar.width > viewport.width / 2);
    assert.ok(bar.y >= area.y + area.height);
  }
});

test('quando manca spazio sotto, la barra resta sopra la selezione e dentro la finestra', () => {
  const area = { x: 450, y: 360, width: 150, height: 60 };
  const viewport = { width: 1275, height: 524 };
  const bar = {
    ...positionPrompt(area, camera, viewport, 420, 54),
    width: 420,
    height: 54,
  };
  assert.equal(overlap(bar, area), 0);
  assert.ok(bar.y + bar.height < area.y);
  assert.ok(bar.x >= 12 && bar.x + bar.width <= viewport.width - 12);
});

test('zoom e origine del pannello vengono considerati nel calcolo della selezione', () => {
  const area = { x: 10, y: 20, width: 180, height: 70 };
  const view = { x: 690, y: 120, zoom: 1.5 };
  const rectangle = { x: 705, y: 150, width: 270, height: 105 };
  const bar = {
    ...positionPrompt(area, view, { width: 1280, height: 800 }, 420, 54),
    width: 420,
    height: 54,
  };
  assert.equal(overlap(bar, rectangle), 0);
  assert.ok(bar.y > rectangle.y + rectangle.height);
});

test('su mobile evita una selezione grande e non supera i bordi della finestra', () => {
  const area = { x: 10, y: 540, width: 340, height: 140 };
  const viewport = { width: 390, height: 844 };
  const bar = {
    ...positionPrompt(area, camera, viewport, 366, 54),
    width: 366,
    height: 54,
  };
  assert.equal(overlap(bar, area), 0);
  assert.ok(bar.x >= 12 && bar.x + bar.width <= viewport.width - 12);
  assert.ok(bar.y >= 0 && bar.y + bar.height <= viewport.height);
});
