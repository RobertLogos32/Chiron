export const SUBJECT_COLORS = ['#9baabf', '#91b4bc', '#a0b2a1', '#bd9d9a', '#b7af98'];
export const SUBJECT_COLOR_NAMES = [
  'Ardesia',
  'Azzurro tenue',
  'Salvia',
  'Rosa cipria',
  'Sabbia',
];

// Existing subjects use the calmer palette without rewriting saved user data.
export function displayStudyColor(color: string) {
  const legacy = ['#a99cf0', '#6fb5cf', '#8cc09a', '#e3959b', '#dcc06a'];
  const index = legacy.indexOf(color.toLowerCase());
  return index === -1 ? color : SUBJECT_COLORS[index];
}
export const MAX_PDF_SIZE = 50 * 1024 * 1024;

export type Subject = { id: string; name: string; color: string };
export type StudyResource = {
  id: string;
  subjectId: string;
  kind: 'pdf' | 'notebook';
  name: string;
  color: string;
  createdAt: number;
  size?: number;
};
export type Library = {
  version: 1;
  subjects: Subject[];
  resources: StudyResource[];
  selectedSubjectId: string | null;
};

export function emptyLibrary(): Library {
  return { version: 1, subjects: [], resources: [], selectedSubjectId: null };
}

export function parseLibrary(raw: string | null): Library {
  if (!raw) return emptyLibrary();
  const value = JSON.parse(raw);
  if (
    value.version !== 1 ||
    !Array.isArray(value.subjects) ||
    !Array.isArray(value.resources)
  ) {
    throw new Error('Archivio non leggibile. I dati esistenti sono ancora nel browser.');
  }
  const ids = new Set<string>();
  const subjects: Subject[] = value.subjects.filter((subject: Subject) => {
    if (
      !subject ||
      typeof subject.id !== 'string' ||
      ids.has(subject.id) ||
      typeof subject.name !== 'string' ||
      !subject.name.trim() ||
      typeof subject.color !== 'string' ||
      !/^#[a-f0-9]{6}$/i.test(subject.color)
    )
      return false;
    ids.add(subject.id);
    return true;
  });
  const resourceIds = new Set<string>();
  const resources: StudyResource[] = value.resources.filter((resource: StudyResource) => {
    if (
      !resource ||
      typeof resource.id !== 'string' ||
      resourceIds.has(resource.id) ||
      !ids.has(resource.subjectId) ||
      !['pdf', 'notebook'].includes(resource.kind) ||
      typeof resource.name !== 'string' ||
      !resource.name.trim() ||
      typeof resource.color !== 'string' ||
      !/^#[a-f0-9]{6}$/i.test(resource.color) ||
      !Number.isFinite(resource.createdAt) ||
      (resource.size !== undefined &&
        (!Number.isFinite(resource.size) || resource.size < 0))
    )
      return false;
    resourceIds.add(resource.id);
    return true;
  });
  return {
    version: 1,
    subjects,
    resources,
    selectedSubjectId: ids.has(value.selectedSubjectId)
      ? value.selectedSubjectId
      : (subjects[0]?.id ?? null),
  };
}

export function validatePdfs(files: Pick<File, 'name' | 'size' | 'type'>[]) {
  // The whole selection is refused together: say so when it holds several files.
  const group = files.length > 1 ? ' Nessuno dei file selezionati è stato aggiunto.' : '';
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      throw new Error(
        `“${file.name}” non è un PDF. Scegli un file con estensione .pdf.${group}`,
      );
    }
    if (file.size > MAX_PDF_SIZE)
      throw new Error(
        `“${file.name}” supera i 50 MB. Scegli un PDF più piccolo.${group}`,
      );
    if (file.size === 0)
      throw new Error(`“${file.name}” è vuoto. Scegli un altro PDF.${group}`);
  }
}

export function formatFileSize(bytes = 0) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}
