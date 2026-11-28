import { useEffect, useState } from 'react';
import type Konva from 'konva';
import { Image as CanvasImage, Line, Text } from 'react-konva';
import { inkColor } from '../../model/appearance';
import type { Note, Point, TextNote, Tool, Theme } from '../../model/types';
import { NOTE_FONT } from '../../config/defaults';
import { themedVisualSvg } from '../../model/visual';

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
      {notes.map((note) => {
        if (note.type === 'stroke')
          return (
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
          );

        const properties = {
          id: `note-${note.id}`,
          noteId: note.id,
          x: note.x,
          y: note.y,
          visible: note.id !== editingId,
          draggable: tool === 'hand' && !isLocked?.(note),
          listening: tool === 'hand' || tool === 'text' || tool === 'select',
          onDragMove: constrainTextPosition
            ? (event: Konva.KonvaEventObject<DragEvent>) => {
                event.target.position(
                  constrainTextPosition(event.target.position(), note),
                );
              }
            : undefined,
          onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
            const position =
              constrainTextPosition?.(event.target.position(), note) ??
              event.target.position();
            event.target.position(position);
            onMove?.(note, position);
          },
        };
        const color = inkColor(note.color, theme);
        if (note.visual) {
          const { svg, width, height } = note.visual;
          return (
            <VisualInk
              key={note.id}
              {...properties}
              width={width}
              height={height}
              svg={themedVisualSvg(svg, theme)}
              label={note.text}
              color={color}
            />
          );
        }
        return note.latex ? (
          <FormulaInk
            key={note.id}
            {...properties}
            {...note.latex}
            formula={note.text}
            fontSize={note.fontSize}
            color={color}
          />
        ) : (
          <Text
            key={note.id}
            {...properties}
            width={note.width ?? 600}
            text={note.text}
            fontSize={note.fontSize}
            lineHeight={1.5}
            fill={color}
            fontFamily={NOTE_FONT}
          />
        );
      })}
    </>
  );
}

function VisualInk({
  svg,
  label,
  color,
  ...properties
}: Omit<Konva.ImageConfig, 'image'> & { svg: string; label: string; color: string }) {
  const [image, setImage] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const next = new Image();
    next.onload = () => {
      setImage(next);
      setFailed(false);
    };
    next.onerror = () => setFailed(true);
    next.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return () => {
      next.onload = null;
      next.onerror = null;
    };
  }, [svg]);

  return failed ? (
    <Text {...properties} text={label} fontSize={18} fill={color} />
  ) : (
    <CanvasImage {...properties} image={image} />
  );
}

function FormulaInk({
  formula,
  fontSize,
  color,
  ...properties
}: Omit<Konva.ImageConfig, 'image'> & {
  formula: string;
  fontSize: number;
  color: string;
}) {
  const [image, setImage] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void import('../../lib/renderLatex')
      .then(({ renderLatex }) => renderLatex(formula, fontSize, color))
      .then((result) => {
        if (!current) return;
        setImage(result.image);
        setFailed(false);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [formula, fontSize, color]);

  return failed ? (
    <Text {...properties} text={formula} fontSize={fontSize} fill={color} wrap="none" />
  ) : (
    <CanvasImage {...properties} image={image} />
  );
}
