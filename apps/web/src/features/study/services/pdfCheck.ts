import { loadPdf } from '../../reader/services/pdfEngine';

const OPEN_TIMEOUT = 8000;

export type PdfCheck = { readable: File[]; unreadable: string[] };

/** Opens every file with PDF.js, so a renamed text file is refused at import, not at opening. */
export async function checkPdfs(files: File[]): Promise<PdfCheck> {
  const results = await Promise.all(files.map(isReadablePdf));
  return {
    readable: files.filter((_, index) => results[index]),
    unreadable: files.filter((_, index) => !results[index]).map((file) => file.name),
  };
}

async function isReadablePdf(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!header.includes('%PDF-')) return false;
  const task = loadPdf(bytes);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const document = await Promise.race([
      task.promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), OPEN_TIMEOUT);
      }),
    ]);
    return document.numPages > 0;
  } catch (failure) {
    // A password-protected PDF is valid: the reader asks for the password when it opens.
    return (failure as { name?: string } | null)?.name === 'PasswordException';
  } finally {
    clearTimeout(timer);
    void task.destroy();
  }
}

export function unreadableMessage(names: string[], added: number) {
  const list = names.map((name) => `“${name}”`).join(', ');
  const subject =
    names.length === 1
      ? `${list} non è un PDF leggibile e non è stato aggiunto.`
      : `${list} non sono PDF leggibili e non sono stati aggiunti.`;
  return added ? `${subject} Gli altri file sono stati aggiunti.` : subject;
}
