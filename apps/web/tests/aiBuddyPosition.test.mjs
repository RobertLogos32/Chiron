import test from 'node:test';
import assert from 'node:assert/strict';
import { positionAiBuddy } from '../src/features/whiteboard/lib/getAiBuddyPosition.ts';

const base = {
  area: { x: 80, y: 120, width: 180, height: 100 },
  camera: { x: 645, y: 38, zoom: 1 },
  pane: { x: 645, y: 38, width: 630, height: 486 },
  viewport: { x: 0, y: 0, width: 1275, height: 524 },
  size: { width: 92, height: 60 },
};
const place = (options = {}) => positionAiBuddy({ ...base, ...options });
const docked = { x: 1171, y: 452, placement: 'page' };

test('scorrendo in verticale o orizzontale il buddy conserva sempre lo stesso angolo della selezione', () => {
  const first = place();
  assert.deepEqual(first, { x: 813, y: 272, placement: 'selection' });
  for (const [dx, dy] of [
    [0, -60],
    [0, 80],
    [-80, 0],
    [50, 0],
  ]) {
    assert.deepEqual(place({ camera: { ...base.camera, x: 645 + dx, y: 38 + dy } }), {
      x: first.x + dx,
      y: first.y + dy,
      placement: 'selection',
    });
  }
});

test('se manca spazio sotto la selezione il buddy si fissa alla pagina senza saltare su altri lati', () => {
  assert.deepEqual(place({ camera: { ...base.camera, y: 280 } }), docked);
  assert.deepEqual(place({ camera: { ...base.camera, y: -400 } }), docked);
});

test('scorrendo verso sinistra il buddy non può passare dalla lavagna al PDF affiancato', () => {
  assert.deepEqual(place({ camera: { ...base.camera, x: 320 } }), docked);
  assert.deepEqual(place({ camera: { ...base.camera, x: 100 } }), docked);
  assert.equal(place().placement, 'selection', 'Ritorna alla selezione quando ricompare');
});

test('una selezione completamente nascosta attiva l’indicatore fisso anche se il buddy sarebbe ancora visibile', () => {
  assert.deepEqual(place({ camera: { ...base.camera, y: -184 } }), docked);
});

test('sotto il 93% si fissa alla pagina; al 93% e ingrandendo resta ancorato a dimensione costante', () => {
  for (const zoom of [0.92999, 0.8, 0.25]) {
    assert.deepEqual(place({ camera: { ...base.camera, zoom } }), docked);
  }
  for (const zoom of [0.93, 1, 1.5]) {
    const buddy = place({ camera: { ...base.camera, zoom } });
    assert.equal(buddy.placement, 'selection');
    assert.equal(buddy.x, 645 + (80 + 180) * zoom - 92);
    assert.equal(buddy.y, 38 + (120 + 100) * zoom + 14);
  }
});

test('il punto fisso non dipende da quanto si continua a scorrere o ridurre lo zoom', () => {
  for (const camera of [
    { x: -400, y: -900, zoom: 1 },
    { x: 645, y: 38, zoom: 0.5 },
    { x: -800, y: -700, zoom: 2 },
  ])
    assert.deepEqual(place({ camera }), docked);
});

test('il dock rispetta l’area visibile della pagina con una barra laterale aperta', () => {
  assert.deepEqual(
    place({
      camera: { ...base.camera, zoom: 0.9 },
      viewport: { x: 248, y: 0, width: 1027, height: 524 },
    }),
    docked,
  );
});

test('su mobile il dock mantiene X e rotella visibili senza coprire le barre degli strumenti', () => {
  const viewport = { x: 0, y: 0, width: 390, height: 844 };
  const obstacles = [
    { x: 20, y: 730, width: 350, height: 100 },
    { x: 338, y: 553, width: 40, height: 150 },
  ];
  const buddy = place({
    viewport,
    pane: viewport,
    obstacles,
    camera: { x: 0, y: 0, zoom: 0.9 },
  });
  assert.equal(buddy.placement, 'page');
  assert.ok(buddy.x >= 12 && buddy.x + 92 <= 378);
  assert.ok(buddy.y >= 12 && buddy.y + 60 <= 832);
  for (const obstacle of obstacles) {
    const overlap =
      Math.max(
        0,
        Math.min(buddy.x + 92, obstacle.x + obstacle.width) -
          Math.max(buddy.x, obstacle.x),
      ) *
      Math.max(
        0,
        Math.min(buddy.y + 60, obstacle.y + obstacle.height) -
          Math.max(buddy.y, obstacle.y),
      );
    assert.equal(overlap, 0);
  }
});
