import { useCallback, useEffect, useRef, useState } from 'react';
import { PasswordResponses, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import { loadPdf } from '../services/pdfEngine';
import { createDemoDocument } from '../lib/demoDocument';
import type { LoadedPdf, PasswordRequest } from '../model/types';

export function usePdfDocument() {
  const [source, setSource] = useState<LoadedPdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<PasswordRequest | null>(null);
  const task = useRef<PDFDocumentLoadingTask | null>(null);
  const sequence = useRef(0);

  const close = useCallback(() => {
    sequence.current++;
    const previous = task.current;
    task.current = null;
    if (previous) void previous.destroy().catch(() => {});
    setSource(null);
    setPassword(null);
    setLoading(false);
  }, []);

  const open = useCallback(
    async (data: Uint8Array | Promise<Uint8Array>, name: string) => {
      const instance = ++sequence.current;
      const previous = task.current;
      task.current = null;
      if (previous) void previous.destroy().catch(() => {});
      setSource(null);
      setPassword(null);
      setError(null);
      setLoading(true);
      try {
        const bytes = await data;
        if (sequence.current !== instance) return;
        const pending = loadPdf(bytes);
        task.current = pending;
        pending.onPassword = (submit: (value: string) => void, reason: number) => {
          if (sequence.current !== instance) return;
          setPassword({
            incorrect: reason === PasswordResponses.INCORRECT_PASSWORD,
            submit(value) {
              setPassword(null);
              submit(value);
            },
          });
        };
        const document = await pending.promise;
        if (sequence.current !== instance) {
          await pending.destroy();
          return;
        }
        setSource({ document, name, id: document.fingerprints[0] ?? name, instance });
      } catch (failure) {
        if (sequence.current === instance) {
          setError(
            failure instanceof Error && failure.name === 'PasswordException'
              ? 'La password non consente di aprire questo PDF.'
              : 'Non riesco ad aprire questo documento. Scegli un PDF valido e riprova.',
          );
        }
      } finally {
        if (sequence.current === instance) setLoading(false);
      }
    },
    [],
  );

  const openFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Scegli un file PDF.');
        return;
      }
      void open(
        file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
        file.name,
      );
    },
    [open],
  );
  const openExample = useCallback(
    () => void open(createDemoDocument(), 'Documento di esempio.pdf'),
    [open],
  );

  useEffect(
    () => () => {
      sequence.current++;
      if (task.current) void task.current.destroy().catch(() => {});
    },
    [],
  );

  return {
    source,
    loading,
    error,
    password,
    openFile,
    openExample,
    close,
    dismissError: () => setError(null),
  };
}
