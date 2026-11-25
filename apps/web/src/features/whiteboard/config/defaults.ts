import type { Camera, Tool } from '../model/types';

export const COLORS = ['#303749', '#5657b8', '#3e83a2', '#4d8b70', '#c36c75', '#e1b851'];
export const DARK_COLORS = [
  '#e2e6f0',
  '#b1a6f4',
  '#7dbcd2',
  '#91bea3',
  '#e29ca6',
  '#dcc77b',
];
export const NOTE_FONT = 'Segoe Print, Comic Sans MS, cursive';
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };
export const DEFAULT_COLORS = { pen: COLORS[0], highlighter: COLORS[5], text: COLORS[0] };
export const DEFAULT_SIZES: Record<Tool, number> = {
  select: 3,
  pen: 3,
  highlighter: 28,
  eraser: 28,
  text: 24,
  hand: 3,
  ai: 3,
};
