import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDemoDocument } from '../src/features/reader/lib/demoDocument.ts';

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
  } finally {
    await task.destroy();
  }
});
