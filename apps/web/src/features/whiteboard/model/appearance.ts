import { COLORS, DARK_COLORS } from '../config/defaults';
import type { Theme } from './types';

export function inkColor(color: string, theme: Theme) {
  const index = COLORS.indexOf(color);
  return theme === 'dark' && index >= 0 ? DARK_COLORS[index] : color;
}
