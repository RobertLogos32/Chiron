import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(projectRoot, 'public/pdfjs');
if (!output.startsWith(path.resolve(projectRoot, 'public') + path.sep)) {
  throw new Error('Invalid PDF asset directory.');
}
await mkdir(output, { recursive: true });
for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(path.join(packageRoot, directory), path.join(output, directory), {
    recursive: true,
  });
}
console.log('PDF fonts, character maps and image decoders are available locally.');
