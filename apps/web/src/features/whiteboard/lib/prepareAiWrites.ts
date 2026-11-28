import { AI_INK_COLOR, DEFAULT_COLORS } from '../config/defaults';
import { inkColor } from '../model/appearance';
import type { AiWrite, AiWriteStyle } from '../model/ai';
import type { TextNote, Theme } from '../model/types';

export async function prepareAiWrites(
  writes: AiWrite[],
  theme: Theme,
  style: AiWriteStyle = 'solution',
) {
  const notes: TextNote[] = [];
  const failed: string[] = [];
  for (const write of writes) {
    const note: TextNote = {
      id: crypto.randomUUID(),
      type: 'text',
      x: 0,
      y: 0,
      text: write.content.trim(),
      color: style === 'note' ? DEFAULT_COLORS.text : AI_INK_COLOR,
      fontSize: write.kind === 'latex' ? 26 : 20,
    };
    if (write.kind === 'visual') {
      note.visual = write.visual;
    } else if (write.kind === 'latex') {
      try {
        note.text = unwrapLatex(note.text);
        const { renderLatex } = await import('./renderLatex');
        const { width, height } = await renderLatex(
          note.text,
          note.fontSize,
          inkColor(note.color, theme),
        );
        note.latex = { width, height };
      } catch {
        failed.push(write.content);
        continue;
      }
    }
    notes.push(note);
  }
  return { notes, failed };
}

function unwrapLatex(text: string) {
  const fenced = text.match(/^```(?:latex|tex)?\s*\n([\s\S]*?)\n```$/i);
  const formula = (fenced?.[1] ?? text).trim();
  for (const [open, close] of [
    ['$$', '$$'],
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['$', '$'],
  ]) {
    if (formula.startsWith(open) && formula.endsWith(close)) {
      return formula.slice(open.length, -close.length).trim();
    }
  }
  return formula;
}
