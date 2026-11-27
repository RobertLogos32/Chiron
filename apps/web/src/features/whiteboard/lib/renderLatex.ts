import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import type { Size } from '../model/types';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const math = mathjax.document('', {
  InputJax: new TeX({
    packages: ['base', 'ams'],
    maxBuffer: 8192,
    maxMacros: 1000,
    formatError: (_jax: unknown, error: unknown) => {
      throw error;
    },
  }),
  OutputJax: new SVG({ fontData: MathJaxTexFont, fontCache: 'none' }),
});
type RenderedFormula = Size & { image: HTMLImageElement };
const cache = new Map<string, Promise<RenderedFormula>>();

export function renderLatex(content: string, fontSize: number, color: string) {
  const key = JSON.stringify([content, fontSize, color]);
  const previous = cache.get(key);
  if (previous) return previous;
  const rendering = typeset(content, fontSize, color).catch((error: unknown) => {
    if (cache.get(key) === rendering) cache.delete(key);
    throw error;
  });
  cache.set(key, rendering);
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  return rendering;
}

async function typeset(
  content: string,
  fontSize: number,
  color: string,
): Promise<RenderedFormula> {
  const container = math.convert(content, { display: true });
  const svg = adaptor.firstChild(container);
  if (!(svg instanceof LiteElement) || svg.kind !== 'svg') {
    throw new Error('Formula LaTeX non valida.');
  }
  const [, , w, h] = adaptor.getAttribute(svg, 'viewBox').split(/\s+/).map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error('Formula LaTeX vuota.');
  }
  const scale = Math.min(fontSize / 1000, 540 / w, 1600 / h);
  const width = w * scale;
  const height = h * scale;
  adaptor.setAttribute(svg, 'width', String(Math.ceil(width * 2)));
  adaptor.setAttribute(svg, 'height', String(Math.ceil(height * 2)));
  adaptor.setAttribute(svg, 'style', `color:${color}`);
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(adaptor.outerHTML(svg))}`;
  await image.decode();
  return { image, width, height };
}
