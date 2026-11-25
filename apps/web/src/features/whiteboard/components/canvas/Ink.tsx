import { Line, Text } from 'react-konva';
import { inkColor } from '../../model/appearance';
import type { Note, Point, TextNote, Tool, Theme } from '../../model/types';
import { NOTE_FONT } from '../../config/defaults';

export function Ink({
  notes,
  tool,
  theme,
  editingId,
  onMove,
  constrainTextPosition,
  isLocked,
}: {
  notes: Note[];
  tool: Tool;
  theme: Theme;
  editingId?: string;
  onMove?: (note: TextNote, position: Point) => void;
  constrainTextPosition?: (position: Point, note: TextNote) => Point;
  isLocked?: (note: Note) => boolean;
}) {
  return (
    <>
      {notes.map((note) =>
        note.type === 'stroke' ? (
          <Line
            key={note.id}
            id={`note-${note.id}`}
            noteId={note.id}
            points={note.points}
            stroke={inkColor(note.color, theme)}
            strokeWidth={note.width}
            tension={note.tool === 'highlighter' ? 0 : 0.35}
            lineCap={note.tool === 'highlighter' ? 'square' : 'round'}
            lineJoin="round"
            opacity={note.tool === 'highlighter' ? (theme === 'dark' ? 0.28 : 0.32) : 1}
            listening={tool === 'select'}
            hitStrokeWidth={Math.max(note.width, 12)}
          />
        ) : (
          <Text
            key={note.id}
            id={`note-${note.id}`}
            noteId={note.id}
            x={note.x}
            y={note.y}
            width={note.width ?? 600}
            text={note.text}
            fontSize={note.fontSize}
            lineHeight={1.5}
            fill={inkColor(note.color, theme)}
            fontFamily={NOTE_FONT}
            visible={note.id !== editingId}
            draggable={tool === 'hand' && !isLocked?.(note)}
            listening={tool === 'hand' || tool === 'text' || tool === 'select'}
            onDragMove={
              constrainTextPosition
                ? (event) => {
                    event.target.position(
                      constrainTextPosition(event.target.position(), note),
                    );
                  }
                : undefined
            }
            onDragEnd={(event) => {
              const position =
                constrainTextPosition?.(event.target.position(), note) ??
                event.target.position();
              event.target.position(position);
              onMove?.(note, position);
            }}
          />
        ),
      )}
    </>
  );
}
