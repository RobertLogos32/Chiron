import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAnnotationPages,
  saveAnnotationPages,
} from '../src/features/annotations/services/storage.ts';

const stroke = {
  id: 'stroke-1',
  type: 'stroke',
  tool: 'pen',
  points: [10, 20, 30, 40],
  color: '#303749',
  width: 3,
};
const text = {
  id: 'text-1',
  type: 'text',
  x: 20,
  y: 50,
  text: 'Nota sulla pagina 2',
  color: '#303749',
  fontSize: 24,
};
const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test('mantiene separati gli appunti di documenti e pagine diverse', () => {
  const storage = memoryStorage();
  saveAnnotationPages('documento A', { 1: [stroke], 2: [text] }, storage);
  saveAnnotationPages('documento B', { 1: [text] }, storage);
  assert.deepEqual(loadAnnotationPages('documento A', storage), {
    1: [stroke],
    2: [text],
  });
  assert.deepEqual(loadAnnotationPages('documento B', storage), { 1: [text] });
  assert.deepEqual(loadAnnotationPages('sconosciuto', storage), {});
});

test('ignora pagine corrotte senza perdere gli appunti validi', () => {
  const storage = memoryStorage();
  saveAnnotationPages(
    'corrotto',
    {
      0: [stroke],
      1: [text],
      2: [{ ...stroke, points: [10, 20, 30] }],
      3: [stroke, stroke],
      4: [{ ...text, fontSize: 900 }],
    },
    storage,
  );
  assert.deepEqual(loadAnnotationPages('corrotto', storage), { 1: [text] });
});

test('la lettura resta utilizzabile con dati illeggibili o storage bloccato', () => {
  assert.deepEqual(loadAnnotationPages('rotto', { getItem: () => '{invalid' }), {});
  assert.deepEqual(
    loadAnnotationPages('bloccato', {
      getItem: () => {
        throw new Error('Storage non disponibile');
      },
    }),
    {},
  );
});
