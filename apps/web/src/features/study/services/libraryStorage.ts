import { parseLibrary, type Library } from '../model/library';

const LIBRARY_KEY = 'chiron.study.library.v1';
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chiron-study', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        database = undefined;
        reject(
          new Error(
            'Non riesco ad aprire l’archivio PDF. Consenti il salvataggio nel browser e riprova.',
          ),
        );
      };
      request.onblocked = () => {
        database = undefined;
        reject(new Error('Chiudi le altre schede di Chiron e riprova.'));
      };
    });
  return database;
}

export function loadLibrary() {
  return parseLibrary(localStorage.getItem(LIBRARY_KEY));
}

export function saveLibrary(library: Library) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    throw new Error(
      'Non riesco a salvare la libreria. Libera spazio nel browser e riprova.',
    );
  }
}

export async function storeFiles(files: { id: string; file: File }[]) {
  if (!files.length) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    for (const { id, file } of files) transaction.objectStore('files').put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        new Error('Spazio insufficiente per salvare i PDF. Libera spazio e riprova.'),
      );
  });
}

export async function retrieveFile(id: string): Promise<File> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly');
    const request = transaction.objectStore('files').get(id);
    request.onsuccess = () =>
      request.result instanceof Blob
        ? resolve(
            request.result instanceof File
              ? request.result
              : new File([request.result], 'Documento.pdf', { type: 'application/pdf' }),
          )
        : reject(
            new Error(
              'Questo PDF non è più nel browser. Aggiungilo di nuovo alla materia.',
            ),
          );
    request.onerror = () =>
      reject(new Error('Non riesco a leggere il PDF. Riprova ad aprirlo.'));
  });
}

export async function removeFiles(ids: string[]) {
  if (!ids.length) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    ids.forEach((id) => transaction.objectStore('files').delete(id));
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(new Error('Non riesco a liberare lo spazio dei PDF rimossi. Riprova.'));
  });
}
