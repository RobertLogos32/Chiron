import { useId, useLayoutEffect, useState, type RefObject } from 'react';
import { annotationScreenBounds, intersectBounds } from '../../lib/aiAnnotations';
import type { AiSurface, ExplainedRegion } from '../../model/ai';
import type { Bounds, Point } from '../../model/types';

type Mark = { index: number; box: Bounds; label: Point; arrow: string | null };
type Layout = { clip: Bounds; marks: Mark[] };

export function AiAnnotationLinks({
  area,
  annotations,
  surface,
  form,
  position,
}: {
  area: Bounds;
  annotations: ExplainedRegion[];
  surface: AiSurface;
  form: RefObject<HTMLFormElement | null>;
  position: Point;
}) {
  const id = useId();
  const [layout, setLayout] = useState<Layout | null>(null);

  useLayoutEffect(() => {
    const anchor = surface.anchor.current;
    const card = form.current?.querySelector('.ai-prompt-content');
    const response = form.current?.querySelector('.ai-prompt-response');
    if (!anchor || !card || !response || surface.ready === false) {
      setLayout(null);
      return;
    }
    const workspace = anchor.closest('.study-workspace-panes');
    const numbers = Array.from(response.querySelectorAll('.ai-explanation-number'));
    const viewport = window.visualViewport;

    const update = () => {
      if (!anchor.checkVisibility()) {
        setLayout(null);
        return;
      }
      const pane = anchor.getBoundingClientRect();
      const editor = workspace?.getBoundingClientRect() ?? pane;
      const visible = intersectBounds(editor, {
        x: viewport?.offsetLeft ?? 0,
        y: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? document.documentElement.clientWidth,
        height: viewport?.height ?? window.innerHeight,
      });
      const clip = visible && intersectBounds(pane, visible);
      if (!clip) {
        setLayout(null);
        return;
      }
      const panel = card.getBoundingClientRect();
      const list = response.getBoundingClientRect();
      const marks: Mark[] = [];
      annotations.forEach((annotation, index) => {
        const box = annotationScreenBounds(annotation, area, surface.camera, pane);
        const shown = intersectBounds(box, clip);
        if (!shown) return;
        const number = numbers[index]?.getBoundingClientRect();
        const rowY = number ? number.top + number.height / 2 : -1;
        marks.push({
          index,
          box,
          label: { x: shown.x, y: Math.max(clip.y, shown.y - 18) },
          arrow:
            rowY > list.top && rowY < list.bottom ? pointToRow(shown, panel, rowY) : null,
        });
      });
      setLayout({ clip, marks });
    };

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    for (const element of [anchor, workspace, card, response]) {
      if (element) observer.observe(element);
    }
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
    };
  }, [area, annotations, surface, form, position.x, position.y]);

  if (!layout?.marks.length) return null;
  const clipId = `${id}-clip`;
  const arrowId = `${id}-arrow`;
  return (
    <svg
      className="ai-annotation-links"
      data-theme={surface.theme}
      data-source={surface.context}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect {...layout.clip} />
        </clipPath>
        <marker
          id={arrowId}
          markerWidth="9"
          markerHeight="9"
          refX="8"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0 0 9 4.5 0 9Z" fill="currentColor" />
        </marker>
      </defs>
      {layout.marks.map(({ index, arrow }) =>
        arrow ? (
          <path
            key={index}
            className="ai-annotation-arrow"
            d={arrow}
            markerEnd={`url(#${arrowId})`}
          />
        ) : null,
      )}
      <g clipPath={`url(#${clipId})`}>
        {layout.marks.map(({ index, box, label }) => (
          <g key={index}>
            <rect className="ai-annotation-box" {...box} />
            <rect
              className="ai-annotation-number"
              {...label}
              width="18"
              height="18"
              rx="3"
            />
            <text x={label.x + 9} y={label.y + 9}>
              {index + 1}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function pointToRow(box: Bounds, panel: DOMRect, rowY: number): string | null {
  if (intersectBounds(box, panel)) return null;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const left = center.x < panel.left + panel.width / 2;
  const endX = left ? panel.left - 2 : panel.right + 2;
  const approachX = endX + (left ? -24 : 24);
  const dx = approachX - center.x;
  const dy = rowY - center.y;
  const scale = Math.max(
    Math.abs(dx) / (box.width / 2),
    Math.abs(dy) / (box.height / 2),
    1,
  );
  const x = center.x + dx / scale;
  const y = center.y + dy / scale;
  return `M ${x} ${y} C ${approachX} ${y}, ${approachX} ${rowY}, ${endX} ${rowY}`;
}
