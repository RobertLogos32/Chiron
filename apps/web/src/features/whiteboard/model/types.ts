export type Theme = 'light' | 'dark';
export type Pattern = 'blank' | 'ruled' | 'grid' | 'dots';
export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'hand' | 'ai';
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Bounds = Point & Size;
export type BoardWritePlacement = 'below';
export type Camera = Point & { zoom: number };
export type Appearance = { theme: Theme; pattern: Pattern };

export type Stroke = {
  id: string;
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  points: number[];
  color: string;
  width: number;
};

export type TextNote = {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  width?: number;
  latex?: Size;
};

export type Note = Stroke | TextNote;
export type TextDraft = Omit<TextNote, 'type'>;
export type NotesUpdate = (notes: Note[]) => Note[];
export type CommitNotes = (update: NotesUpdate) => void;
export type BoundsFor = (note: Note) => Bounds;
export type PointerGesture = {
  move: (point: Point, event: PointerEvent) => void;
  finish: () => void;
};
