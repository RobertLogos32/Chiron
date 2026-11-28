import type { BoardVisual } from './types';

export function isBoardVisual(value: unknown): value is BoardVisual {
  if (!value || typeof value !== 'object') return false;
  const { width, height, svg } = value as Partial<BoardVisual>;
  return (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    width <= 600 &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height > 0 &&
    height <= 1600 &&
    typeof svg === 'string' &&
    svg.length <= 50_000 &&
    svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ') &&
    svg.endsWith('</svg>')
  );
}

// The agent draws its visuals with a dark palette; on a light board or PDF page each
// colour is swapped for its light counterpart, so the card follows the theme.
const LIGHT_PALETTE: Record<string, string> = {
  '#222936': '#ffffff',
  '#536076': '#c3cad8',
  '#f1f4fa': '#1f2633',
  '#1b2230': '#f5f7fb',
  '#47536a': '#b8c1d1',
  '#353f53': '#e2e7ef',
  '#343f55': '#d9dfe9',
  '#93a3bc': '#6b7a93',
  '#becade': '#4d5a70',
  '#e1e9f7': '#253042',
  '#a4b5ce': '#5d6c85',
  '#e2e6f0': '#2b3445',
  '#aebed7': '#5f6f8a',
  '#34436a': '#e4e9ff',
  '#9baafb': '#5b6fd6',
  '#2b3d50': '#e6f0f7',
  '#6e97b9': '#4f7fa6',
  '#ffd37a': '#9a5d00',
  '#72dcf0': '#0d87a0',
  '#c5a7ff': '#7a4fd1',
  '#ffad77': '#c45a14',
  '#8fe3a8': '#2e9a55',
  '#f2d36b': '#a07e00',
  '#f58fb0': '#c23d6c',
  '#7fb2ff': '#2f6fd6',
  '#d7e36b': '#7d8a12',
};

export function themedVisualSvg(svg: string, theme: 'light' | 'dark') {
  if (theme === 'dark') return svg;
  return svg.replace(
    /#[0-9a-f]{6}\b/gi,
    (color) => LIGHT_PALETTE[color.toLowerCase()] ?? color,
  );
}
