import test from 'node:test';
import assert from 'node:assert/strict';
import { noteBounds } from '../src/features/whiteboard/lib/geometry.ts';
import {
  protectLockedNotes,
  segmentIsLocked,
} from '../src/features/whiteboard/lib/lockedAreas.ts';
import {
  createHistory,
  historyReducer,
} from '../src/features/whiteboard/model/history.ts';

const areas = [{ x: 100, y: 100, width: 100, height: 100 }];
const stroke = (id, points) => ({
  id,
  type: 'stroke',
  tool: 'pen',
  points,
  width: 3,
  color: '#222222',
});
const inside = stroke('locked', [120, 140, 180, 150]);
const outside = stroke('free', [300, 140, 340, 150]);
const protect = (previous, next) => protectLockedNotes(previous, next, areas, noteBounds);

test('penna, gomma e cancellazione non possono aggiungere o rimuovere contenuto nell’area AI', () => {
  assert.deepEqual(protect([inside, outside], []), [inside]);
  assert.equal(
    protect([inside], [{ ...inside, points: [120, 140, 130, 150] }])[0],
    inside,
  );
  assert.deepEqual(protect([], [inside, outside]), [outside]);
});

test('il tratto che attraversa una zona protetta viene fermato anche con un solo movimento veloce', () => {
  assert.equal(segmentIsLocked({ x: 20, y: 150 }, { x: 300, y: 150 }, 2, areas), true);
  assert.equal(segmentIsLocked({ x: 20, y: 98 }, { x: 300, y: 98 }, 3, areas), true);
  assert.equal(segmentIsLocked({ x: 20, y: 20 }, { x: 300, y: 20 }, 3, areas), false);
  assert.equal(
    segmentIsLocked({ x: 0, y: 0 }, { x: 300, y: 300 }, 1, [
      { x: 0, y: 200, width: 20, height: 20 },
    ]),
    false,
  );
});

test('scrivere e modificare fuori dall’area resta possibile mentre i suoi oggetti sono immutabili', () => {
  const moved = { ...outside, points: [350, 300, 400, 310] };
  assert.deepEqual(protect([inside, outside], [inside, moved]), [inside, moved]);
  const movedInside = { ...outside, points: [110, 120, 170, 150] };
  assert.deepEqual(protect([inside, outside], [inside, movedInside]), [inside, outside]);
});

test('un testo che tocca l’area AI non può essere spostato, modificato o cancellato', () => {
  const text = {
    id: 'text',
    type: 'text',
    x: 80,
    y: 120,
    text: 'Appunto in lavorazione',
    fontSize: 20,
    color: '#222222',
    width: 200,
  };
  assert.deepEqual(protect([text], []), [text]);
  assert.deepEqual(protect([text], [{ ...text, x: 400, text: 'Modificato' }]), [text]);
});

test('annulla e ripeti mantengono il contenuto bloccato e modificano quello libero', () => {
  let history = createHistory([]);
  history = historyReducer(history, { type: 'commit', update: () => [inside] });
  history = historyReducer(history, {
    type: 'commit',
    update: (notes) => [...notes, outside],
  });
  history = historyReducer(history, { type: 'undo', protect });
  assert.deepEqual(history.present, [inside]);
  assert.equal(historyReducer(history, { type: 'undo', protect }), history);
  history = historyReducer(history, { type: 'redo', protect });
  assert.deepEqual(history.present, [inside, outside]);
});

test('annullare una richiesta sovrapposta non sblocca il contenuto protetto da un’altra richiesta', () => {
  const other = { x: 110, y: 110, width: 100, height: 100 };
  assert.deepEqual(protectLockedNotes([inside], [], [other], noteBounds), [inside]);
  assert.deepEqual(protectLockedNotes([inside], [], [], noteBounds), []);
});
