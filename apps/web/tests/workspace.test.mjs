import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closePane,
  insertPane,
  openResourcePane,
  resizePanes,
  reorderPane,
} from '../src/features/study/model/workspace.ts';

const pdf = { id: 'pdf', kind: 'pdf', subjectId: 'subject', name: 'Dispensa.pdf' };
const notebook = {
  id: 'notebook',
  kind: 'notebook',
  subjectId: 'subject',
  name: 'Appunti',
};
const initial = openResourcePane(null, pdf, { paneId: 'one' });

test('si possono affiancare più PDF, lavagne e chat in qualsiasi ordine, anche dello stesso materiale', () => {
  let state = openResourcePane(initial, pdf, { afterId: 'one', paneId: 'two' });
  state = openResourcePane(state, notebook, { afterId: 'two', paneId: 'three' });
  state = insertPane(state, { id: 'chat', kind: 'chat', weight: 1 }, 'one');
  assert.deepEqual(
    state.panes.map((pane) => pane.kind),
    ['pdf', 'chat', 'pdf', 'notebook'],
  );
  assert.equal(state.panes.filter((pane) => pane.resourceId === 'pdf').length, 2);
  assert.equal(state.activeId, 'chat');
  assert.equal(initial.panes.length, 1);
});

test('aprire dalla navigazione attiva una vista esistente e Cambia sostituisce soltanto il pannello scelto', () => {
  const state = openResourcePane(initial, notebook, { afterId: 'one', paneId: 'two' });
  assert.equal(openResourcePane(state, pdf).activeId, 'one');
  const replaced = openResourcePane(state, notebook, { paneId: 'one' });
  assert.equal(replaced.panes.length, 2);
  assert.equal(replaced.panes[0].id, 'one');
  assert.equal(replaced.panes[0].resourceId, 'notebook');
  assert.equal(replaced.panes[1], state.panes[1]);
});

test('chiudere un pannello mantiene gli altri e sceglie un vicino; l’ultimo torna alla libreria', () => {
  const state = openResourcePane(initial, notebook, { afterId: 'one', paneId: 'two' });
  const closed = closePane(state, 'two');
  assert.deepEqual(
    closed.panes.map((pane) => pane.id),
    ['one'],
  );
  assert.equal(closed.activeId, 'one');
  assert.equal(closePane(closed, 'one'), null);
});

test('ridimensionare due pannelli conserva gli altri e il peso complessivo', () => {
  const state = insertPane(
    openResourcePane(initial, notebook, { afterId: 'one', paneId: 'two' }),
    { id: 'chat', kind: 'chat', weight: 1 },
  );
  const next = resizePanes(state, 'one', 'two', 0.65);
  assert.equal(next.panes[0].weight, 1.3);
  assert.equal(next.panes[1].weight, 0.7);
  assert.equal(next.panes[2], state.panes[2]);
  assert.equal(resizePanes(next, 'one', 'two', Infinity), next);
});

test('una richiesta AI può riaprire il pannello originale senza sostituire le altre viste', () => {
  const state = openResourcePane(initial, notebook, { afterId: 'one', paneId: 'two' });
  const closed = closePane(state, 'two');
  const restored = openResourcePane(closed, notebook, { paneId: 'two' });
  assert.equal(restored.panes[0], state.panes[0]);
  assert.equal(restored.panes[1].id, 'two');
  assert.equal(restored.activeId, 'two');
});

test('riordinare a sinistra o a destra conserva identità, pesi e pannello attivo', () => {
  const state = insertPane(
    openResourcePane(initial, notebook, { afterId: 'one', paneId: 'two' }),
    { id: 'chat', kind: 'chat', weight: 1 },
  );
  const left = reorderPane(state, 'chat', 'one', 'before');
  assert.deepEqual(
    left.panes.map((pane) => pane.id),
    ['chat', 'one', 'two'],
  );
  assert.equal(left.panes[0], state.panes[2]);
  assert.equal(left.panes[1], state.panes[0]);
  assert.equal(left.panes[2], state.panes[1]);
  assert.equal(left.activeId, state.activeId);
  const right = reorderPane(left, 'chat', 'two', 'after');
  assert.deepEqual(right.panes, state.panes);
  assert.deepEqual(
    state.panes.map((pane) => pane.id),
    ['one', 'two', 'chat'],
  );
  assert.equal(reorderPane(state, 'one', 'two', 'before'), state);
  assert.equal(reorderPane(state, 'missing', 'two', 'after'), state);
  assert.equal(reorderPane(state, 'one', 'missing', 'before'), state);
  assert.equal(reorderPane(state, 'one', 'one', 'after'), state);
});
