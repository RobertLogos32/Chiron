import Konva from 'konva';
import { NOTE_FONT } from '../config/defaults';
import type { Bounds, TextNote } from '../model/types';

// Below this scale the 13 px labels of a diagram drop under 9.5 px: ask for more space instead.
export const MIN_VISUAL_SCALE = 0.72;
// Narrower than this, a solution turns into a column of two-letter lines.
export const MIN_READABLE_TEXT_WIDTH = 160;

/** Narrowest width that keeps every word whole and the text readable. */
export function minimumTextWidth(note: TextNote) {
  const natural = textSize({ ...note, width: 600 }).width;
  const words = note.text.split(/\s+/).filter(Boolean);
  const longestWord = Math.max(
    1,
    ...words.map((word) => textSize({ ...note, text: word, width: 600 }).width),
  );
  return Math.ceil(
    Math.min(600, Math.max(longestWord, Math.min(natural, MIN_READABLE_TEXT_WIDTH))),
  );
}

export function fitWriteBlock(notes: TextNote[], space: Bounds) {
  const gap = 12;
  for (const width of new Set([Math.min(390, space.width), Math.min(600, space.width)])) {
    const drafts = notes.map((note) =>
      note.latex || note.visual ? note : { ...note, width },
    );
    const originalSizes = drafts.map(textSize);
    const spacing = (drafts.length - 1) * gap;
    const contentHeight = originalSizes.reduce(
      (sum, size, index) => sum + (drafts[index].visual ? 0 : size.height),
      spacing,
    );
    const visualHeight = drafts.reduce(
      (sum, note) => sum + (note.visual?.height ?? 0),
      0,
    );
    const heightScale = visualHeight ? (space.height - contentHeight) / visualHeight : 1;
    const scales = drafts.map((note) =>
      note.visual ? Math.min(1, space.width / note.visual.width, heightScale) : 1,
    );
    if (scales.some((scale) => scale < MIN_VISUAL_SCALE)) continue;
    const sizes = originalSizes.map(({ width, height }, index) => ({
      width: width * scales[index],
      height: height * scales[index],
    }));
    const size = {
      width: Math.max(...sizes.map((item) => item.width)),
      height: sizes.reduce((sum, item) => sum + item.height, spacing),
    };
    if (size.width > space.width || size.height > space.height) continue;
    let y = space.y;
    const placed = drafts.map((note, index) => {
      const placedNote = { ...note, x: space.x, y };
      if (note.visual) placedNote.visual = { ...note.visual, ...sizes[index] };
      y += sizes[index].height + gap;
      return placedNote;
    });
    return { notes: placed, bounds: { x: space.x, y: space.y, ...size } };
  }
  return null;
}

export function textSize(note: TextNote) {
  const fixedSize = note.latex ?? note.visual;
  if (fixedSize) return { width: fixedSize.width, height: fixedSize.height };
  const text = new Konva.Text({
    text: note.text,
    width: note.width ?? 600,
    fontSize: note.fontSize,
    fontFamily: NOTE_FONT,
    lineHeight: 1.5,
  });
  return {
    width: Math.max(1, Math.min(text.width(), text.getTextWidth())),
    height: text.height(),
  };
}
