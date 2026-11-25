import { Layer, Rect } from 'react-konva';
import type { Bounds, Theme, Tool } from '../../model/types';

type SelectionOverlayProps = {
  bounds: Bounds | null;
  aiArea: Bounds | null;
  busyAreas?: Bounds[];
  marquee: Bounds | null;
  zoom: number;
  theme: Theme;
  tool: Tool;
};

export function SelectionOverlay({
  bounds,
  aiArea,
  busyAreas = [],
  marquee,
  zoom,
  theme,
  tool,
}: SelectionOverlayProps) {
  const accent = theme === 'dark' ? '#c0b2f4' : '#7571bd';

  return (
    <Layer listening={false}>
      {bounds && (
        <Rect
          x={bounds.x - 5 / zoom}
          y={bounds.y - 5 / zoom}
          width={bounds.width + 10 / zoom}
          height={bounds.height + 10 / zoom}
          stroke={theme === 'dark' ? '#b9a8ef' : '#7571bd'}
          strokeWidth={1.25 / zoom}
          dash={[6 / zoom, 4 / zoom]}
        />
      )}
      {busyAreas.map((area, index) => (
        <Rect
          key={index}
          {...area}
          fill="#91b4bc12"
          stroke={accent}
          strokeWidth={1.25 / zoom}
          dash={[7 / zoom, 4 / zoom]}
        />
      ))}
      {aiArea && (
        <Rect
          {...aiArea}
          fill="#9b8bd50b"
          stroke={accent}
          strokeWidth={1.25 / zoom}
          dash={[7 / zoom, 4 / zoom]}
        />
      )}
      {marquee && (
        <Rect
          {...marquee}
          fill="#9b8bd524"
          stroke={accent}
          strokeWidth={1 / zoom}
          dash={tool === 'ai' ? [7 / zoom, 4 / zoom] : undefined}
        />
      )}
    </Layer>
  );
}
