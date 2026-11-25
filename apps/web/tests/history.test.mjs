import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistory,
  historyReducer,
} from '../src/features/whiteboard/model/history.ts';
import { cutStroke } from '../src/features/whiteboard/lib/geometry.ts';

const original = {
  id: 'original',
  type: 'stroke',
  tool: 'pen',
  color: '#303749',
  width: 2,
  points: [0, 0, 100, 0],
};

test('one eraser transaction is undone and redone as a whole', () => {
  const pieces = cutStroke(original, { x: 50, y: 0 }, { x: 50, y: 0 }, 10);
  const initial = createHistory([original]);
  const erased = historyReducer(initial, { type: 'commit', update: () => pieces });
  assert.equal(erased.present.length, 2);

  const undone = historyReducer(erased, { type: 'undo' });
  assert.deepEqual(undone.present, [original]);
  assert.deepEqual(historyReducer(undone, { type: 'redo' }).present, pieces);
});

test('a new edit after undo invalidates redo, while a no-op preserves it', () => {
  const initial = createHistory([]);
  const edited = historyReducer(initial, { type: 'commit', update: () => [original] });
  const undone = historyReducer(edited, { type: 'undo' });
  assert.equal(
    historyReducer(undone, { type: 'commit', update: (notes) => notes }),
    undone,
  );

  const replacement = { ...original, id: 'replacement' };
  const branched = historyReducer(undone, {
    type: 'commit',
    update: () => [replacement],
  });
  assert.equal(branched.future.length, 0);
  assert.equal(historyReducer(branched, { type: 'redo' }), branched);
});

test('the history retains exactly the most recent fifty edits', () => {
  let history = createHistory([]);
  for (let index = 0; index < 60; index++) {
    history = historyReducer(history, {
      type: 'commit',
      update: (notes) => [...notes, { ...original, id: String(index) }],
    });
  }
  assert.equal(history.past.length, 50);
  for (let index = 0; index < 50; index++)
    history = historyReducer(history, { type: 'undo' });
  assert.equal(history.present.length, 10);
  assert.equal(historyReducer(history, { type: 'undo' }), history);
});
