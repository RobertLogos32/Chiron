import type { PDFPageProxy } from 'pdfjs-dist';
import type { Bounds, Size } from '@whiteboard/model/types';
import { intersectBounds } from '../../whiteboard/lib/aiAnnotations.ts';

type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
type Viewport = ReturnType<PDFPageProxy['getViewport']>;
type OperatorList = Awaited<ReturnType<PDFPageProxy['getOperatorList']>>;
type TextOperators = Pick<
  typeof import('pdfjs-dist').OPS,
  | 'setFont'
  | 'showText'
  | 'save'
  | 'restore'
  | 'paintFormXObjectBegin'
  | 'paintFormXObjectEnd'
>;
type GlyphRepairs = Map<string, Map<string, string>>;
export type PdfTextRun = { text: string; bounds: Bounds };

const doubledMathGlyph = /^([\u{1d400}-\u{1d7ff}])\1$/u;
export const mayHaveDoubledMathGlyph = /([\u{1d400}-\u{1d7ff}])\1/u;

export function pdfMathGlyphRepairs(
  list: OperatorList,
  ops: TextOperators,
): GlyphRepairs {
  const mappings = new Map<string, Set<string>>();
  const savedFonts: (string | undefined)[] = [];
  let font: string | undefined;
  for (let index = 0; index < list.fnArray.length; index++) {
    const operation = list.fnArray[index];
    if (operation === ops.save || operation === ops.paintFormXObjectBegin)
      savedFonts.push(font);
    else if (operation === ops.restore || operation === ops.paintFormXObjectEnd)
      font = savedFonts.pop();
    else if (operation === ops.setFont) font = list.argsArray[index][0];
    else if (operation === ops.showText && font) {
      let glyphs = mappings.get(font);
      if (!glyphs) mappings.set(font, (glyphs = new Set()));
      for (const glyph of list.argsArray[index][0]) {
        if (
          typeof glyph?.unicode === 'string' &&
          /[\u{1d400}-\u{1d7ff}]/u.test(glyph.unicode)
        ) {
          glyphs.add(glyph.unicode);
        }
      }
    }
  }

  const repairs: GlyphRepairs = new Map();
  for (const [fontName, glyphs] of mappings) {
    const replacements = new Map<string, string>();
    for (const glyph of glyphs) {
      const match = glyph.match(doubledMathGlyph);
      if (
        match &&
        ![...glyphs].some((other) => other !== glyph && other.includes(match[1]))
      ) {
        replacements.set(glyph, match[1]);
      }
    }
    if (replacements.size) repairs.set(fontName, replacements);
  }
  return repairs;
}

export function pdfTextRuns(
  content: TextContent,
  viewport: Viewport,
  repairs?: GlyphRepairs,
): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const [a, b, c, d, x, y] = item.transform;
    const advance = Math.hypot(a, b);
    const height = Math.hypot(c, d);
    const font = content.styles[item.fontName];
    if (!advance || !height || !item.width || font?.vertical) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const u of [0, item.width / advance]) {
      for (const v of [font?.descent ?? -0.2, font?.ascent ?? 0.8]) {
        const [left, top] = viewport.convertToViewportPoint(
          x + a * u + c * v,
          y + b * u + d * v,
        );
        xs.push(left);
        ys.push(top);
      }
    }
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    let value = item.str;
    for (const [glyph, repaired] of repairs?.get(item.fontName) ?? []) {
      value = value.replaceAll(glyph, repaired);
    }
    runs.push({
      text: value,
      bounds: {
        x: left,
        y: top,
        width: Math.max(...xs) - left,
        height: Math.max(...ys) - top,
      },
    });
  }
  return runs;
}

const centerY = ({ bounds }: PdfTextRun) => bounds.y + bounds.height / 2;

function mergeNumericFractions(
  runs: PdfTextRun[],
  hasBar: (area: Bounds) => boolean,
): PdfTextRun[] {
  const digits = runs.filter(({ text }) =>
    /^\d{1,8}$/.test(text.trim().normalize('NFKC')),
  );
  const equations = runs.filter(({ text }) => text.includes('='));
  const used = new Set<PdfTextRun>();
  const fractions: PdfTextRun[] = [];
  for (const numerator of digits) {
    if (used.has(numerator)) continue;
    const upper = numerator.bounds;
    const denominator = digits.find((candidate) => {
      if (candidate === numerator || used.has(candidate)) return false;
      const lower = candidate.bounds;
      const width = Math.max(upper.width, lower.width);
      const height = Math.max(upper.height, lower.height);
      const verticalDistance = centerY(candidate) - centerY(numerator);
      const axis = (upper.y + upper.height + lower.y) / 2;
      if (
        verticalDistance < height * 0.65 ||
        verticalDistance > height * 2.5 ||
        Math.abs(upper.x + upper.width / 2 - lower.x - lower.width / 2) > width * 0.3 ||
        !equations.some(
          (run) => Math.abs(centerY(run) - axis) <= run.bounds.height * 0.58,
        )
      )
        return false;
      const halfBand = Math.min(upper.height, lower.height) * 0.22;
      return hasBar({
        x: Math.min(upper.x, lower.x),
        y: axis - halfBand,
        width:
          Math.max(upper.x + upper.width, lower.x + lower.width) -
          Math.min(upper.x, lower.x),
        height: 2 * halfBand,
      });
    });
    if (!denominator) continue;
    const lower = denominator.bounds;
    const x = Math.min(upper.x, lower.x);
    const right = Math.max(upper.x + upper.width, lower.x + lower.width);
    const y = (upper.y + upper.height + lower.y) / 2;
    for (const run of runs) {
      if (
        /^[-−―_]+$/.test(run.text.trim()) &&
        run.bounds.x >= x - 1 &&
        run.bounds.x + run.bounds.width <= right + 1 &&
        Math.abs(centerY(run) - y) <= run.bounds.height * 0.45
      ) {
        used.add(run);
      }
    }
    used.add(numerator);
    used.add(denominator);
    const height = Math.max(upper.height, lower.height);
    fractions.push({
      text: `(${numerator.text.trim().normalize('NFKC')}/${denominator.text.trim().normalize('NFKC')})`,
      bounds: { x, y: y - height / 2, width: right - x, height },
    });
  }
  return [...runs.filter((run) => !used.has(run)), ...fractions];
}

export function hasPdfFractionBar(
  canvas: HTMLCanvasElement,
  size: Size,
  area: Bounds,
): boolean {
  const scaleX = canvas.width / size.width;
  const scaleY = canvas.height / size.height;
  const x = Math.max(0, Math.floor(area.x * scaleX));
  const y = Math.max(0, Math.floor(area.y * scaleY));
  const width = Math.min(canvas.width, Math.ceil((area.x + area.width) * scaleX)) - x;
  const height = Math.min(canvas.height, Math.ceil((area.y + area.height) * scaleY)) - y;
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext || width < 2 || height < 1) return false;
  const pixels = canvasContext.getImageData(x, y, width, height).data;
  const minimum = Math.ceil(width * 0.65);
  for (let row = 0; row < height; row++) {
    let dark = 0;
    for (let column = 0; column < width; column++) {
      const i = (row * width + column) * 4;
      dark =
        pixels[i + 3] >= 128 && pixels[i] + pixels[i + 1] + pixels[i + 2] < 620
          ? dark + 1
          : 0;
      if (dark >= minimum) return true;
    }
  }
  return false;
}

// Relative advance of a character, enough to tell where a word lies inside its line.
function glyphWeight(character: string) {
  if (/[iljtfrI.,;:'’!|()\s]/.test(character)) return 0.5;
  if (/[mwMW@]/.test(character)) return 1.45;
  if (/[A-Z0-9]/.test(character)) return 1.15;
  return 1;
}

/**
 * The words of a run that lie inside the selection. PDF.js often returns a whole line as
 * one item: a rectangle drawn around «annotazioni» must still pass that word as text.
 */
export function partialPdfRun(run: PdfTextRun, area: Bounds): PdfTextRun | undefined {
  const { bounds, text } = run;
  const overlap =
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
  if (overlap < bounds.height * 0.5 || !text.trim()) return undefined;
  const characters = [...text];
  const weights = characters.map(glyphWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const scale = bounds.width / total;
  const words: { text: string; left: number; right: number }[] = [];
  let position = bounds.x;
  let word: (typeof words)[number] | undefined;
  characters.forEach((character, index) => {
    const advance = weights[index] * scale;
    if (/\s/.test(character)) word = undefined;
    else if (word) {
      word.text += character;
      word.right = position + advance;
    } else {
      word = { text: character, left: position, right: position + advance };
      words.push(word);
    }
    position += advance;
  });
  const inside = words.filter(({ left, right }) => {
    const center = (left + right) / 2;
    return center >= area.x && center <= area.x + area.width;
  });
  if (!inside.length) return undefined;
  const left = inside[0].left;
  const right = inside[inside.length - 1].right;
  return {
    text: inside.map((item) => item.text).join(' '),
    bounds: { ...bounds, x: left, width: right - left },
  };
}

export function selectedPdfText(
  runs: PdfTextRun[],
  area: Bounds,
  hasBar?: (area: Bounds) => boolean,
  includesInk?: (bounds: Bounds) => boolean,
): string | undefined {
  let selected = runs.flatMap((run) => {
    const { bounds } = run;
    if (
      (bounds.x >= area.x &&
        bounds.x + bounds.width <= area.x + area.width &&
        bounds.y >= area.y &&
        bounds.y + bounds.height <= area.y + area.height) ||
      (!!includesInk && !!intersectBounds(bounds, area) && includesInk(bounds))
    )
      return [run];
    const part = partialPdfRun(run, area);
    return part ? [part] : [];
  });
  if (hasBar) selected = mergeNumericFractions(selected, hasBar);
  selected.sort((a, b) => centerY(a) - centerY(b));
  const rows: PdfTextRun[][] = [];
  for (const run of selected) {
    const row = rows[rows.length - 1];
    if (
      row &&
      centerY(run) - centerY(row[0]) <=
        Math.min(run.bounds.height, row[0].bounds.height) * 0.33
    ) {
      row.push(run);
    } else {
      rows.push([run]);
    }
  }
  const text = rows
    .map((row) =>
      row
        .sort((a, b) => a.bounds.x - b.bounds.x)
        .map((run, index) => {
          const previous = row[index - 1];
          const gap = previous
            ? run.bounds.x - previous.bounds.x - previous.bounds.width
            : 0;
          if (
            index === 1 &&
            /^\d{1,3}$/.test(previous.text.trim()) &&
            gap > Math.min(previous.bounds.height, run.bounds.height) &&
            row.some((item) => item.text.includes('='))
          ) {
            return '\t' + run.text.trim();
          }
          const space =
            previous &&
            (gap > run.bounds.height * 0.12 ||
              /\s$/.test(previous.text) ||
              /^\s/.test(run.text));
          return (space ? ' ' : '') + run.text.trim();
        })
        .join(''),
    )
    .join('\n');
  return text && text.length <= 8000 ? text : undefined;
}

export function pdfGlyphsWithinSelection(
  canvas: HTMLCanvasElement,
  page: Size,
  bounds: Bounds,
  area: Bounds,
): boolean {
  const scaleX = canvas.width / page.width;
  const scaleY = canvas.height / page.height;
  const left = Math.max(0, Math.floor(bounds.x * scaleX));
  const top = Math.max(0, Math.floor(bounds.y * scaleY));
  const right = Math.min(canvas.width, Math.ceil((bounds.x + bounds.width) * scaleX));
  const bottom = Math.min(canvas.height, Math.ceil((bounds.y + bounds.height) * scaleY));
  const context = canvas.getContext('2d');
  if (!context || right <= left || bottom <= top) return false;
  const width = right - left;
  const pixels = context.getImageData(left, top, width, bottom - top).data;
  let hasInk = false;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = ((y - top) * width + x - left) * 4;
      if (
        pixels[offset + 3] < 64 ||
        pixels[offset] + pixels[offset + 1] + pixels[offset + 2] >= 690
      )
        continue;
      const px = (x + 0.5) / scaleX;
      const py = (y + 0.5) / scaleY;
      if (
        px < area.x ||
        px > area.x + area.width ||
        py < area.y ||
        py > area.y + area.height
      )
        return false;
      hasInk = true;
    }
  }
  return hasInk;
}
