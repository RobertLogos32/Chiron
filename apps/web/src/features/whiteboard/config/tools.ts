import {
  Eraser,
  Hand,
  Highlighter,
  MousePointer2,
  PenLine,
  Sparkles,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { Tool } from '../model/types';

type ToolDefinition = { id: Tool; label: string; shortcut: string; icon: LucideIcon };

export const TOOLS: ToolDefinition[] = [
  { id: 'select', label: 'Seleziona', shortcut: 'S', icon: MousePointer2 },
  { id: 'pen', label: 'Penna', shortcut: 'P', icon: PenLine },
  { id: 'highlighter', label: 'Evidenziatore', shortcut: 'H', icon: Highlighter },
  { id: 'eraser', label: 'Gomma', shortcut: 'E', icon: Eraser },
  { id: 'text', label: 'Testo', shortcut: 'T', icon: Type },
  { id: 'hand', label: 'Mano', shortcut: 'V', icon: Hand },
  { id: 'ai', label: 'AI', shortcut: 'A', icon: Sparkles },
];
