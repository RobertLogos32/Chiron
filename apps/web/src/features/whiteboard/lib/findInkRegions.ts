import type { Bounds } from '../model/types';

type Span = { start: number; end: number };
const MAX_REGIONS = 64;

export function findInkRegions(pixels: ImageData, pdf: boolean): Bounds[] {
  const { width, height, data } = pixels;
  const mask = new Uint8Array(width * height);
  const rows = new Uint16Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const offset = index * 4;
      if (
        data[offset + 3] >= 96 &&
        (!pdf || Math.min(data[offset], data[offset + 1], data[offset + 2]) < 175)
      ) {
        mask[index] = 1;
        rows[y]++;
      }
    }
  }
  const lines = occupiedSpans(rows, 2);

  function collect(groups: 'glyphs' | 'words' | 'lines') {
    return lines.flatMap(({ start, end }) => {
      const columns = new Uint16Array(width);
      for (let y = start; y < end; y++) {
        for (let x = 0; x < width; x++) columns[x] += mask[y * width + x];
      }
      const spans = occupiedSpans(
        columns,
        groups === 'lines'
          ? width
          : groups === 'words'
            ? Math.round((end - start) * 0.22)
            : 0,
      );
      return spans.flatMap(({ start: left, end: right }) => {
        let top = end;
        let bottom = start;
        let count = 0;
        for (let y = start; y < end; y++) {
          for (let x = left; x < right; x++) {
            if (!mask[y * width + x]) continue;
            top = Math.min(top, y);
            bottom = y + 1;
            count++;
          }
        }
        return count > 1
          ? [{ x: left, y: top, width: right - left, height: bottom - top }]
          : [];
      });
    });
  }

  for (const grouping of ['glyphs', 'words', 'lines'] as const) {
    const regions = collect(grouping);
    if (regions.length <= MAX_REGIONS) return regions;
  }
  return [];
}

function occupiedSpans(counts: Uint16Array, gap: number): Span[] {
  const spans: Span[] = [];
  for (let i = 0; i < counts.length; i++) {
    if (!counts[i]) continue;
    const previous = spans.at(-1);
    if (previous && i - previous.end <= gap) previous.end = i + 1;
    else spans.push({ start: i, end: i + 1 });
  }
  return spans;
}
