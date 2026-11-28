import assert from 'node:assert/strict';
import test from 'node:test';
import { removePromptEcho } from '../src/features/whiteboard/lib/aiResponseText.ts';

const prompt = 'scrivi qui dentro un equazione';

test('un risultato già composto che ripete la richiesta non mostra un corpo duplicato', () => {
  assert.equal(removePromptEcho('Scrivi qui dentro un equazione', prompt), '');
  assert.equal(removePromptEcho('**«Scrivi qui dentro un’equazione.»**', prompt), '');
});

test('rimuove la richiesta isolata e conserva i passaggi effettivi della risposta', () => {
  const solution = '2x + 4 = 10\n\n2x = 6\nx = 3';
  assert.equal(
    removePromptEcho(`«Scrivi qui dentro un’equazione»\n\n${solution}`, prompt),
    solution,
  );
  assert.equal(removePromptEcho(solution, prompt), solution);
});

test('una risposta identica alla richiesta resta leggibile se non c’è altro da mostrare', () => {
  const repeat = 'Ripeti esattamente questa richiesta, parola per parola.';
  assert.equal(removePromptEcho(repeat, repeat), repeat);
  assert.equal(
    removePromptEcho('Scrivi qui dentro un equazione', prompt, false),
    'Scrivi qui dentro un equazione',
  );
});
