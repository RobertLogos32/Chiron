import { AI_INK_COLOR, COLORS, DARK_COLORS } from '../config/defaults';
import type { Theme } from './types';

export function inkColor(color: string, theme: Theme) {
  if (theme === 'dark' && color === AI_INK_COLOR) return '#ff9a52';
  const index = COLORS.indexOf(color);
  return theme === 'dark' && index >= 0 ? DARK_COLORS[index] : color;
}
