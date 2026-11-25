import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceAiRequest,
  revealAiCamera,
} from '../src/features/whiteboard/lib/aiNavigation.ts';

const job = (id, y, scope = 'notebook', target) => ({
  id,
  scope,
  area: { x: 100, y, width: 100, height: 20 },
  prompt: id,
  status: 'pending',
  target,
});
const top = job('top', 100);
const middle = job('middle', 300);
const bottom = job('bottom', 500);
const jobs = [middle, bottom, top];
const views = [
  {
    scope: 'notebook',
    pane: { x: 645, y: 38, width: 630, height: 600 },
    camera: { x: 0, y: -500, zoom: 1 },
  },
];
const initial = { id: null, direction: 'up' };

test('parte dalla selezione più vicina sopra la vista corrente', () => {
  assert.equal(advanceAiRequest(jobs, views, initial).job, bottom);
  const nearby = [{ ...views[0], camera: { x: 0, y: 0, zoom: 1 } }];
  assert.equal(advanceAiRequest(jobs, nearby, initial).job, top);
});

test('scorre sempre verso l’alto e inverte il percorso agli estremi senza saltare risultati', () => {
  let cursor = initial;
  const actual = [];
  for (let index = 0; index < 7; index++) {
    const next = advanceAiRequest(jobs, views, cursor);
    actual.push([next.job.id, next.cursor.direction]);
    cursor = next.cursor;
  }
  assert.deepEqual(actual, [
    ['bottom', 'up'],
    ['middle', 'up'],
    ['top', 'up'],
    ['middle', 'down'],
    ['bottom', 'down'],
    ['middle', 'up'],
    ['top', 'up'],
  ]);
});

test('PDF e lavagna condividono l’ordine verticale, rispettando le pagine PDF', () => {
  const pdf1 = job('pdf1', 50, 'pdf:1', {
    kind: 'pdf',
    resourceId: 'pdf',
    page: 1,
    pageHeight: 842,
  });
  const pdf2 = job('pdf2', 20, 'pdf:2', {
    kind: 'pdf',
    resourceId: 'pdf',
    page: 2,
    pageHeight: 842,
  });
  const next = advanceAiRequest([pdf2, middle, pdf1], [], {
    id: 'pdf2',
    direction: 'up',
  });
  assert.equal(next.job, middle);
  assert.equal(advanceAiRequest([pdf2, middle, pdf1], [], next.cursor).job, pdf1);
});

test('se non ci sono risultati sopra parte da quello più vicino sotto', () => {
  const nearby = [{ ...views[0], camera: { x: 0, y: 1000, zoom: 1 } }];
  const next = advanceAiRequest(jobs, nearby, initial);
  assert.equal(next.job, top);
  assert.equal(next.cursor.direction, 'down');
});

test('le frecce permettono di scegliere la direzione e i lavori finiti non sono visitati', () => {
  assert.equal(
    advanceAiRequest(jobs, views, { id: 'middle', direction: 'up' }, 'down').job,
    bottom,
  );
  assert.equal(
    advanceAiRequest([{ ...top, status: 'success' }, middle, bottom], views, {
      id: 'middle',
      direction: 'up',
    }).job,
    bottom,
  );
  assert.equal(advanceAiRequest([], views, initial), undefined);
});

test('le selezioni sovrapposte sono risultati distinti e restano tutte raggiungibili', () => {
  const same = { ...top, id: 'same-area' };
  const next = advanceAiRequest([top, same], views, { id: 'top', direction: 'up' });
  assert.equal(next.job, same);
  assert.equal(advanceAiRequest([same], views, next.cursor).job, same);
});

test('tornare alla selezione ripristina uno zoom leggibile e lascia spazio al buddy', () => {
  const area = { x: 1200, y: 1500, width: 180, height: 100 };
  const viewport = { width: 630, height: 486 };
  const camera = revealAiCamera(area, { x: -4000, y: -5000, zoom: 0.5 }, viewport);
  assert.equal(camera.zoom, 1);
  assert.equal(camera.x + (area.x + area.width / 2) * camera.zoom, viewport.width / 2);
  const bottom = camera.y + (area.y + area.height) * camera.zoom;
  assert.ok(bottom > 0 && bottom + 74 < viewport.height);
});

test('il ritorno conserva l’ingrandimento quando entra nello schermo e non scende sotto il 93%', () => {
  assert.equal(
    revealAiCamera(
      { x: 400, y: 500, width: 100, height: 100 },
      { x: 0, y: 0, zoom: 2 },
      { width: 1000, height: 700 },
    ).zoom,
    2,
  );
  assert.equal(
    revealAiCamera(
      { x: 400, y: 500, width: 1500, height: 1000 },
      { x: 0, y: 0, zoom: 0.5 },
      { width: 390, height: 400 },
    ).zoom,
    0.93,
  );
});
