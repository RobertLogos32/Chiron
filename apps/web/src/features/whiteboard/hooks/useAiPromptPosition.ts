import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Bounds, Camera } from '../model/types';
import { positionPrompt } from '../lib/getPromptPosition';
import { isAiAreaVisible, positionAiBuddy } from '../lib/getAiBuddyPosition';

type Position = {
  x: number;
  y: number;
  width: number;
  placement: 'prompt' | 'selection' | 'page';
};

export function useAiPromptPosition({
  area,
  camera,
  anchor,
  form,
  active,
  compact = false,
  dockWhenOffscreen = false,
  preferredWidth,
  order,
  avoid,
}: {
  area: Bounds;
  camera: Camera;
  anchor: RefObject<HTMLDivElement | null>;
  form: RefObject<HTMLElement | null>;
  active: boolean;
  compact?: boolean;
  dockWhenOffscreen?: boolean;
  preferredWidth?: number;
  order?: number;
  /** Extra elements to keep clear, such as the buttons of the library for the global buddy. */
  avoid?: string;
}) {
  const [position, setPosition] = useState<Position>({
    x: 12,
    y: 44,
    width: 420,
    placement: 'prompt',
  });

  useLayoutEffect(() => {
    if (!active) return;
    const surface = anchor.current;
    const element = form.current;
    if (!element) return;
    const findWorkspace = () =>
      [
        surface?.closest('.study-workspace'),
        document.querySelector('.study-workspace'),
        document.querySelector('#study-content'),
      ].find(
        (candidate): candidate is Element =>
          !!candidate &&
          candidate.checkVisibility() &&
          candidate.getBoundingClientRect().width > 0,
      ) ?? document.documentElement;
    const visibleViewport = window.visualViewport;
    const controls = () => [
      ...findWorkspace().querySelectorAll<HTMLElement>(
        '.toolbar, .study-workspace-tools, .ai-selection-hint, .selection-actions',
      ),
      ...Array.from(
        document.querySelectorAll<HTMLElement>('.ai-task[data-order]:not(.is-docked)'),
      ).filter((task) => order !== undefined && Number(task.dataset.order) < order),
    ];

    function update() {
      const element = form.current;
      if (!element) return;
      const workspace = findWorkspace();
      const source = surface?.getBoundingClientRect() ?? new DOMRect();
      const workspaceBounds =
        workspace === document.documentElement
          ? new DOMRect(0, 0, document.documentElement.clientWidth, window.innerHeight)
          : workspace.getBoundingClientRect();
      const left = Math.max(workspaceBounds.left, visibleViewport?.offsetLeft ?? 0);
      const top = Math.max(workspaceBounds.top, visibleViewport?.offsetTop ?? 0);
      const right = Math.min(
        workspaceBounds.right,
        visibleViewport
          ? visibleViewport.offsetLeft + visibleViewport.width
          : window.innerWidth,
      );
      const bottom = Math.min(
        workspaceBounds.bottom,
        visibleViewport
          ? visibleViewport.offsetTop + visibleViewport.height
          : window.innerHeight,
      );
      const viewport = {
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      };
      const width = Math.min(
        preferredWidth ?? (compact ? 92 : 420),
        Math.max(1, viewport.width - 24),
      );
      const relativeCamera = {
        ...camera,
        x: camera.x + source.left - left,
        y: camera.y + source.top - top,
      };
      const paneLeft = Math.max(left, source.left);
      const paneTop = Math.max(top, source.top);
      const pane = {
        x: paneLeft,
        y: paneTop,
        width: Math.max(0, Math.min(right, source.right) - paneLeft),
        height: Math.max(0, Math.min(bottom, source.bottom) - paneTop),
      };
      const screenCamera = {
        ...camera,
        x: camera.x + source.left,
        y: camera.y + source.top,
      };
      const height = element.getBoundingClientRect().height;
      let value: Position;
      if (
        dockWhenOffscreen &&
        (!surface?.checkVisibility() || !isAiAreaVisible(area, screenCamera, pane))
      ) {
        value = { x: left, y: top, width, placement: 'page' };
      } else if (compact) {
        // Only the controls near the bottom-right corner, where the buddy docks, matter.
        const corner = { left: right - 320, top: bottom - 320 };
        const extra = avoid
          ? Array.from(document.querySelectorAll<HTMLElement>(avoid)).filter((item) => {
              if (element.contains(item) || item.closest('.ai-task')) return false;
              const rect = item.getBoundingClientRect();
              return rect.right > corner.left && rect.bottom > corner.top;
            })
          : [];
        const obstacles: Bounds[] = [...controls(), ...extra]
          .filter((control) => control.checkVisibility())
          .map((control) => {
            const rect = control.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          });
        value = {
          ...positionAiBuddy({
            area,
            camera: screenCamera,
            pane,
            viewport: { x: left, y: top, ...viewport },
            size: { width, height },
            obstacles,
          }),
          width,
        };
      } else {
        const next = positionPrompt(area, relativeCamera, viewport, width, height);
        value = { x: left + next.x, y: top + next.y, width, placement: 'prompt' };
        // Earlier answers keep their place: move this one below them, or above if it does not fit.
        const earlier = Array.from(
          document.querySelectorAll<HTMLElement>('.ai-task[data-order]:not(.is-docked)'),
        )
          .filter(
            (task) =>
              task !== element &&
              order !== undefined &&
              Number(task.dataset.order) < order,
          )
          .map((task) => task.getBoundingClientRect());
        const overlapping = (y: number) =>
          earlier.find(
            (rect) =>
              value.x < rect.right &&
              value.x + width > rect.left &&
              y < rect.bottom + 8 &&
              y + height > rect.top - 8,
          );
        let y = value.y;
        for (let guard = 0, hit = overlapping(y); hit && guard < 8; guard++) {
          y = hit.bottom + 8;
          hit = overlapping(y);
        }
        if (y + height > bottom - 12) {
          y = value.y;
          for (let guard = 0, hit = overlapping(y); hit && guard < 8; guard++) {
            y = hit.top - 8 - height;
            hit = overlapping(y);
          }
        }
        value.y = Math.max(top + 12, y);
      }
      setPosition((previous) => {
        return previous.x === value.x &&
          previous.y === value.y &&
          previous.width === width &&
          previous.placement === value.placement
          ? previous
          : value;
      });
    }

    update();
    const observer = new ResizeObserver(update);
    for (const target of new Set([surface, findWorkspace(), element, ...controls()]))
      if (target) observer.observe(target);
    // An answer moves when an earlier one moves: follow their positions too.
    const moves = new MutationObserver(update);
    const followEarlier = () => {
      if (order === undefined) return;
      for (const task of document.querySelectorAll<HTMLElement>('.ai-task[data-order]'))
        if (task !== element && Number(task.dataset.order) < order)
          moves.observe(task, { attributes: true, attributeFilter: ['style'] });
    };
    followEarlier();
    const mutations = new MutationObserver(() => {
      observer.observe(findWorkspace());
      for (const control of controls()) observer.observe(control);
      followEarlier();
      update();
    });
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    visibleViewport?.addEventListener('resize', update);
    visibleViewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      moves.disconnect();
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
      visibleViewport?.removeEventListener('resize', update);
      visibleViewport?.removeEventListener('scroll', update);
    };
  }, [
    active,
    compact,
    dockWhenOffscreen,
    preferredWidth,
    order,
    avoid,
    anchor,
    form,
    area,
    camera.x,
    camera.y,
    camera.zoom,
  ]);

  return position;
}
