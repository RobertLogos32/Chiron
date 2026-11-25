import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentHistory } from '../src/features/whiteboard/model/documentHistory.ts';

const note = (id) => ({
  id,
  type: 'stroke',
  tool: 'pen',
  points: [10, 10, 20, 20],
  color: '#222222',
  width: 3,
});
test('due viste condividono gli aggiornamenti e la cronologia senza perdere i tratti precedenti', () => {
  const document = createDocumentHistory([]);
  let first, second;
  const stopA = document.subscribe(() => {
    first = document.getSnapshot().present;
  });
  document.subscribe(() => {
    second = document.getSnapshot().present;
  });
  document.dispatch({ type: 'commit', update: (notes) => [...notes, note('a')] });
  document.dispatch({ type: 'commit', update: (notes) => [...notes, note('b')] });
  assert.deepEqual(
    first.map((item) => item.id),
    ['a', 'b'],
  );
  assert.equal(first, second);
  document.dispatch({ type: 'undo' });
  assert.deepEqual(
    second.map((item) => item.id),
    ['a'],
  );
  document.dispatch({ type: 'redo' });
  assert.deepEqual(
    second.map((item) => item.id),
    ['a', 'b'],
  );
  stopA();
  document.dispatch({ type: 'commit', update: (notes) => [...notes, note('c')] });
  assert.deepEqual(
    document.getSnapshot().present.map((item) => item.id),
    ['a', 'b', 'c'],
  );
});
test('una protezione AI resta efficace anche quando la modifica arriva da un’altra vista', () => {
  const locked = note('locked');
  const document = createDocumentHistory([locked]);
  document.dispatch({
    type: 'commit',
    update: () => [],
    protect: (previous) => previous,
  });
  assert.deepEqual(document.getSnapshot().present, [locked]);
});
