import { useRef, useState } from 'react';
import { createDemoDocument } from '../../reader/lib/demoDocument';
import {
  emptyLibrary,
  SUBJECT_COLORS,
  validatePdfs,
  type Library,
  type StudyResource,
} from '../model/library';
import {
  loadLibrary,
  removeFiles,
  saveLibrary,
  storeFiles,
} from '../services/libraryStorage';

export function useStudyLibrary() {
  const [initial] = useState(() => {
    try {
      return { library: loadLibrary(), error: '' };
    } catch (error) {
      return {
        library: emptyLibrary(),
        error:
          error instanceof Error ? error.message : 'Non riesco a leggere la libreria.',
      };
    }
  });
  const [library, setLibrary] = useState(initial.library);
  const current = useRef(library);

  function commit(next: Library) {
    saveLibrary(next);
    current.current = next;
    setLibrary(next);
  }

  function makePdfs(subjectId: string, files: File[]): StudyResource[] {
    return files.map((file) => ({
      id: crypto.randomUUID(),
      subjectId,
      name: file.name,
      kind: 'pdf',
      color: '#e3959b',
      size: file.size,
      createdAt: Date.now(),
    }));
  }

  async function addSubject(name: string, color: string, files: File[]) {
    validatePdfs(files);
    const subject = { id: crypto.randomUUID(), name: name.trim(), color };
    const resources = makePdfs(subject.id, files);
    await storeFiles(
      resources.map((resource, index) => ({ id: resource.id, file: files[index] })),
    );
    commit({
      ...current.current,
      subjects: [...current.current.subjects, subject],
      resources: [...current.current.resources, ...resources],
      selectedSubjectId: subject.id,
    });
    return subject.id;
  }

  async function addPdfs(subjectId: string, files: File[]) {
    validatePdfs(files);
    const resources = makePdfs(subjectId, files);
    await storeFiles(
      resources.map((resource, index) => ({ id: resource.id, file: files[index] })),
    );
    commit({
      ...current.current,
      resources: [...current.current.resources, ...resources],
    });
    return resources;
  }

  function addNotebook(subjectId: string, name: string, color: string) {
    const notebook: StudyResource = {
      id: crypto.randomUUID(),
      subjectId,
      name: name.trim(),
      kind: 'notebook',
      color,
      createdAt: Date.now(),
    };
    commit({ ...current.current, resources: [...current.current.resources, notebook] });
    return notebook;
  }

  async function addExample() {
    const bytes = createDemoDocument();
    const file = new File([new Uint8Array(bytes)], 'Documento di esempio.pdf', {
      type: 'application/pdf',
    });
    const subjectId = await addSubject('Analisi 1', SUBJECT_COLORS[0], [file]);
    addNotebook(subjectId, 'Ripasso esame', SUBJECT_COLORS[0]);
  }

  function rename(id: string, name: string, kind: 'subject' | 'resource') {
    commit({
      ...current.current,
      subjects: current.current.subjects.map((subject) =>
        kind === 'subject' && subject.id === id
          ? { ...subject, name: name.trim() }
          : subject,
      ),
      resources: current.current.resources.map((resource) =>
        kind === 'resource' && resource.id === id
          ? { ...resource, name: name.trim() }
          : resource,
      ),
    });
  }

  function changeNotebookColor(id: string, color: string) {
    if (!SUBJECT_COLORS.includes(color))
      throw new Error('Scegli uno dei colori disponibili.');
    if (
      !current.current.resources.some(
        (resource) => resource.id === id && resource.kind === 'notebook',
      )
    )
      throw new Error('Questo quaderno non è più disponibile.');
    commit({
      ...current.current,
      resources: current.current.resources.map((resource) =>
        resource.id === id ? { ...resource, color } : resource,
      ),
    });
  }

  async function remove(id: string, kind: 'subject' | 'resource') {
    const deleted = current.current.resources.filter((resource) =>
      kind === 'subject' ? resource.subjectId === id : resource.id === id,
    );
    const subjects = current.current.subjects.filter(
      (subject) => kind !== 'subject' || subject.id !== id,
    );
    commit({
      ...current.current,
      subjects,
      resources: current.current.resources.filter(
        (resource) => !deleted.some((item) => item.id === resource.id),
      ),
      selectedSubjectId:
        kind === 'subject' && current.current.selectedSubjectId === id
          ? (subjects[0]?.id ?? null)
          : current.current.selectedSubjectId,
    });
    await removeFiles(
      deleted
        .filter((resource) => resource.kind === 'pdf')
        .map((resource) => resource.id),
    );
    for (const resource of deleted)
      if (resource.kind === 'notebook')
        localStorage.removeItem(`quaderno.board.v1:${resource.id}`);
  }

  return {
    library,
    initialError: initial.error,
    addSubject,
    addPdfs,
    addNotebook,
    addExample,
    rename,
    changeNotebookColor,
    remove,
    selectSubject: (id: string) => commit({ ...current.current, selectedSubjectId: id }),
  };
}
