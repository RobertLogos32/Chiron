const encoder = new TextEncoder();

function escapeText(text: string) {
  return text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function text(value: string, x: number, y: number, size: number, bold = false) {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapeText(value)}) Tj ET`;
}

function pageContent(page: number) {
  const lines = [
    '0.32 0.33 0.67 rg',
    text('Chiron / PDF', 54, 786, 11, true),
    '0.16 0.19 0.25 rg',
    text(
      page === 1 ? 'Spazio alle annotazioni.' : 'Ogni pagina, i suoi appunti.',
      54,
      715,
      29,
      true,
    ),
    '0.43 0.47 0.54 rg',
    text('Un documento di esempio per provare il visualizzatore.', 54, 681, 12),
    '0.82 0.83 0.89 RG 0.7 w 54 653 m 541 653 l S',
    '0.24 0.27 0.34 rg',
    text(
      page === 1 ? 'Leggere e prendere appunti' : 'Continua da qui',
      54,
      613,
      17,
      true,
    ),
    text(
      page === 1
        ? 'Scegli la penna e scrivi direttamente sul documento.'
        : 'Le annotazioni di questa pagina sono indipendenti.',
      54,
      579,
      12,
    ),
    text(
      page === 1
        ? "Usa l'evidenziatore per dare risalto a una frase."
        : 'Torna alla prima pagina per ritrovare i tuoi appunti.',
      54,
      556,
      12,
    ),
    text('Gomma, testo e selezione funzionano come sulla lavagna.', 54, 533, 12),
    '0.94 0.94 0.98 rg 54 352 487 124 re f',
    '0.32 0.33 0.67 rg',
    text('Una zona libera per le tue idee', 73, 445, 13, true),
    '0.84 0.85 0.91 RG 0.5 w',
    '73 414 m 520 414 l S 73 390 m 520 390 l S',
    '0.43 0.47 0.54 rg',
    text(
      'I PDF restano sul dispositivo. La barra in basso e la stessa della lavagna.',
      54,
      300,
      10,
    ),
    text('Documento di esempio', 54, 46, 10),
    text(`${page} / 2`, 515, 46, 10),
  ];
  return lines.join('\n');
}

// A self-contained, two-page PDF fixture, generated in memory without network requests.
export function createDemoDocument(): Uint8Array {
  const pages = [pageContent(1), pageContent(2)];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ...pages.map(
      (content) =>
        `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    ),
  ];
  let output = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = encoder.encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(output);
}
