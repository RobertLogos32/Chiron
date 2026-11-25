import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Bounds, Camera } from '../model/types';
import { positionPrompt } from '../lib/getPromptPosition';
import { positionAiBuddy } from '../lib/getAiBuddyPosition';

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
  preferredWidth,
  order,
}: {
  area: Bounds;
  camera: Camera;
  anchor: RefObject<HTMLDivElement | null>;
  form: RefObject<HTMLElement | null>;
  active: boolean;
  compact?: boolean;
  preferredWidth?: number;
  order?: number;
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
        document.querySelectorAll<HTMLElement>('.ai-task[data-order]'),
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
      const height = element.getBoundingClientRect().height;
      let value: Position;
      if (compact) {
        const paneLeft = Math.max(left, source.left);
        const paneTop = Math.max(top, source.top);
        const obstacles: Bounds[] = controls()
          .filter((control) => control.checkVisibility())
          .map((control) => {
            const rect = control.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          });
        value = {
          ...positionAiBuddy({
            area,
            camera: { ...camera, x: camera.x + source.left, y: camera.y + source.top },
            pane: {
              x: paneLeft,
              y: paneTop,
              width: Math.max(0, Math.min(right, source.right) - paneLeft),
              height: Math.max(0, Math.min(bottom, source.bottom) - paneTop),
            },
            viewport: { x: left, y: top, ...viewport },
            size: { width, height },
            obstacles,
          }),
          width,
        };
      } else {
        const next = positionPrompt(area, relativeCamera, viewport, width, height);
        value = { x: left + next.x, y: top + next.y, width, placement: 'prompt' };
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
    const mutations = new MutationObserver(() => {
      observer.observe(findWorkspace());
      for (const control of controls()) observer.observe(control);
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
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
      visibleViewport?.removeEventListener('resize', update);
      visibleViewport?.removeEventListener('scroll', update);
    };
  }, [
    active,
    compact,
    preferredWidth,
    order,
    anchor,
    form,
    area,
    camera.x,
    camera.y,
    camera.zoom,
  ]);

  return position;
}
