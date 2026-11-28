import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyLibrary,
  parseLibrary,
  validatePdfs,
  MAX_PDF_SIZE,
} from '../src/features/study/model/library.ts';

test('la libreria scarta riferimenti orfani e duplicati conservando i materiali validi', () => {
  const subject = { id: 'subject-1', name: 'Analisi 1', color: '#a99cf0' };
  const resource = {
    id: 'pdf-1',
    subjectId: subject.id,
    kind: 'pdf',
    name: 'Lezione.pdf',
    color: '#e3959b',
    createdAt: 1234,
  };
  const parsed = parseLibrary(
    JSON.stringify({
      version: 1,
      subjects: [subject, subject],
      selectedSubjectId: 'missing',
      resources: [
        resource,
        resource,
        { ...resource, id: 'orphan', subjectId: 'missing' },
        { ...resource, id: 'invalid', kind: 'other' },
      ],
    }),
  );
  assert.deepEqual(parsed.subjects, [subject]);
  assert.deepEqual(parsed.resources, [resource]);
  assert.equal(parsed.selectedSubjectId, subject.id);
});

test('il primo avvio è vuoto e una libreria illeggibile segnala un errore', () => {
  assert.deepEqual(parseLibrary(null), emptyLibrary());
  assert.throws(() => parseLibrary('{broken'));
  assert.throws(() => parseLibrary('{"version":3}'));
});

test('un caricamento misto o troppo grande viene rifiutato prima di salvare', () => {
  const pdf = { name: 'Lezione.PDF', type: '', size: 10 };
  assert.doesNotThrow(() => validatePdfs([pdf]));
  assert.doesNotThrow(() => validatePdfs([{ ...pdf, size: MAX_PDF_SIZE }]));
  assert.throws(
    () => validatePdfs([pdf, { name: 'Immagine.png', type: 'image/png', size: 10 }]),
    /non è un PDF/,
  );
  assert.throws(() => validatePdfs([{ ...pdf, size: MAX_PDF_SIZE + 1 }]), /50 MB/);
  assert.throws(() => validatePdfs([{ ...pdf, size: 0 }]), /vuoto/);
});

test('un gruppo rifiutato dice che nessun file è stato aggiunto', () => {
  const pdf = { name: 'Appunti.pdf', type: 'application/pdf', size: 10 };
  assert.throws(
    () => validatePdfs([pdf, { name: 'nota.txt', type: 'text/plain', size: 10 }]),
    /nota\.txt.*Nessuno dei file selezionati è stato aggiunto/,
  );
  assert.throws(
    () => validatePdfs([{ name: 'nota.txt', type: 'text/plain', size: 10 }]),
    (error) => !error.message.includes('Nessuno'),
  );
});
