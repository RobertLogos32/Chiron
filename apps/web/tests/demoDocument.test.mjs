import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDemoDocument } from '../src/features/reader/lib/demoDocument.ts';
import {
  pdfGlyphsWithinSelection,
  pdfMathGlyphRepairs,
  pdfTextRuns,
  selectedPdfText,
} from '../src/features/reader/lib/pdfSelectionText.ts';

test('il documento di esempio viene letto dal motore PDF reale', async () => {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(require.resolve('pdfjs-dist/package.json'));
  const task = getDocument({
    data: createDemoDocument(),
    standardFontDataUrl: join(packageRoot, 'standard_fonts').replaceAll('\\', '/') + '/',
  });
  const document = await task.promise;
  try {
    assert.equal(document.numPages, 2);
    const first = await document.getPage(1);
    const second = await document.getPage(2);
    assert.equal(first.getViewport({ scale: 1 }).width, 595);
    assert.equal(first.getViewport({ scale: 1 }).height, 842);
    const contents = await Promise.all([first.getTextContent(), second.getTextContent()]);
    const text = contents.map((content) =>
      content.items.map((item) => item.str ?? '').join(' '),
    );
    assert.match(text[0], /Spazio alle annotazioni/);
    assert.match(text[1], /Ogni pagina/);
    const viewport = first.getViewport({ scale: 1 });
    const runs = pdfTextRuns(contents[0], viewport);
    assert.equal(
      selectedPdfText(runs, { x: 48, y: 98, width: 500, height: 44 }),
      'Spazio alle annotazioni.',
    );
    // PDF.js returns the title as one item: a rectangle around one word still passes it.
    assert.equal(
      selectedPdfText(runs, { x: 60, y: 98, width: 50, height: 44 }),
      'Spazio',
    );
    const title = runs.find(({ text }) => text.includes('annotazioni'));
    const { x, width } = title.bounds;
    assert.equal(
      selectedPdfText(runs, {
        x: x + width * 0.5,
        y: 98,
        width: width * 0.55,
        height: 44,
      }),
      'annotazioni.',
    );
  } finally {
    await task.destroy();
  }
});

test('corregge un singolo glifo matematico con Unicode doppio solo nel font che lo dichiara', () => {
  const shown = (...values) => [values.map((unicode) => ({ unicode }))];
  const operators = {
    fnArray: [
      OPS.setFont,
      OPS.showText,
      OPS.save,
      OPS.setFont,
      OPS.showText,
      OPS.restore,
      OPS.showText,
    ],
    argsArray: [['single'], shown('𝑥𝑥'), [], ['two'], shown('𝑥', '𝑥'), [], shown('𝑥𝑥')],
  };
  const repairs = pdfMathGlyphRepairs(operators, OPS);
  const item = (fontName, str) => ({
    str,
    fontName,
    width: 45,
    transform: [12, 0, 0, 12, 60, 90],
  });
  const viewport = { convertToViewportPoint: (x, y) => [x, 150 - y] };
  const runs = pdfTextRuns(
    {
      items: [item('single', '𝑥𝑥 − 6'), item('two', '𝑥𝑥 − 6')],
      styles: {},
    },
    viewport,
    repairs,
  );
  assert.deepEqual(
    runs.map(({ text }) => text),
    ['𝑥 − 6', '𝑥𝑥 − 6'],
  );
});

test('la frazione verticale diventa una frazione in linea solo se la barra è visibile', () => {
  const run = (text, x, y, width, height) => ({ text, bounds: { x, y, width, height } });
  const runs = [
    run('1', 60, 41, 5, 8),
    run('4', 60, 54, 5, 8),
    run('12', 36, 48, 9, 8),
    run('x + 3 = x − 6', 67, 45, 74, 13),
    run('x = 12', 260, 45, 37, 13),
  ];
  const area = { x: 29, y: 35, width: 125, height: 34 };
  assert.equal(
    selectedPdfText(
      runs,
      area,
      (bar) => bar.x === 60 && bar.y < 52 && bar.y + bar.height > 52,
    ),
    '12\t(1/4) x + 3 = x − 6',
  );
  assert.match(
    selectedPdfText(runs, area, () => false),
    /^1\n/,
  );
});

test('una selezione stretta comprende il glifo anche quando esclude il margine del font', () => {
  const page = { width: 12, height: 20 };
  const bounds = { x: 0, y: 0, ...page };
  const painted = { x: 4, y: 5, width: 4, height: 9 };
  const data = new Uint8ClampedArray(12 * 20 * 4).fill(255);
  for (let y = 5; y < 14; y++) {
    for (let x = 4; x < 8; x++) data.set([0, 0, 0, 255], (y * 12 + x) * 4);
  }
  const canvas = { ...page, getContext: () => ({ getImageData: () => ({ data }) }) };
  const runs = [{ text: '1', bounds }];
  assert.equal(
    selectedPdfText(runs, painted, undefined, (box) =>
      pdfGlyphsWithinSelection(canvas, page, box, painted),
    ),
    '1',
  );
  const cut = { ...painted, y: painted.y + 1 };
  assert.equal(
    selectedPdfText(runs, cut, undefined, (box) =>
      pdfGlyphsWithinSelection(canvas, page, box, cut),
    ),
    undefined,
  );
});
