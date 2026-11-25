import type { PDFDocumentProxy } from 'pdfjs-dist';

export type LoadedPdf = {
  document: PDFDocumentProxy;
  id: string;
  name: string;
  instance: number;
};

export type PasswordRequest = {
  incorrect: boolean;
  submit: (password: string) => void;
};
