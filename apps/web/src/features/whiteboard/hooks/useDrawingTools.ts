import { useState } from 'react';
import { DEFAULT_COLORS, DEFAULT_SIZES } from '../config/defaults';
import type { Tool } from '../model/types';

export function useDrawingTools() {
  const [tool, setTool] = useState<Tool>('pen');
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [sizeOpen, setSizeOpen] = useState(false);
  const colorTool =
    tool === 'highlighter' ? 'highlighter' : tool === 'text' ? 'text' : 'pen';

  const setColor = (color: string) =>
    setColors((previous) => ({ ...previous, [colorTool]: color }));
  const setSize = (size: number) =>
    setSizes((previous) => ({ ...previous, [tool]: size }));

  return {
    tool,
    setTool,
    color: colors[colorTool],
    setColor,
    sizes,
    size: sizes[tool],
    setSize,
    sizeOpen,
    setSizeOpen,
    colorsDisabled: ['select', 'hand', 'eraser', 'ai'].includes(tool),
    sizeDisabled: ['select', 'hand', 'ai'].includes(tool),
  };
}
