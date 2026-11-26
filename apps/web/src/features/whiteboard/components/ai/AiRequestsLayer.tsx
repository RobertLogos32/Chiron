import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import { useAiRequests } from '../../hooks/useAiRequests';
import { useAiPromptPosition } from '../../hooks/useAiPromptPosition';
import { useBoardAppearance } from '../../hooks/useBoardAppearance';
import type { AiJob, AiSurface } from '../../model/ai';
import type { Theme } from '../../model/types';
import { AiBuddy } from './AiBuddy';
import {
  advanceAiRequest,
  type AiCursor,
  type AiDirection,
} from '../../lib/aiNavigation';

const emptyArea = { x: 0, y: 0, width: 0, height: 0 };
const emptyCamera = { x: 0, y: 0, zoom: 0 };

export function AiRequestsLayer({ paused = false }: { paused?: boolean }) {
  const { jobs, surfaces, reveal } = useAiRequests();
  const { theme } = useBoardAppearance();
  const dock = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<AiCursor>({ id: null, direction: 'up' });
  const [docked, setDocked] = useState(new Set<string>());
  const onDocked = useCallback((id: string, value: boolean) => {
    setDocked((current) => {
      if (current.has(id) === value) return current;
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const hiddenJobs = jobs.filter((job) => job.status === 'pending' && docked.has(job.id));
  const pendingJobs = jobs.filter((job) => job.status === 'pending');
  const focused = pendingJobs.find((job) => job.id === cursor.id);
  const displayJobs = focused
    ? [focused, ...jobs.filter((job) => job.id !== focused.id)]
    : jobs;
  const position = useAiPromptPosition({
    area: emptyArea,
    camera: emptyCamera,
    anchor,
    form: dock,
    active: !paused && pendingJobs.length > 0,
    compact: true,
    preferredWidth: 68,
  });
  function goToSelection(direction?: AiDirection) {
    const views = [...surfaces].flatMap(([scope, surface]) => {
      const element = surface.anchor.current;
      if (!element?.checkVisibility()) return [];
      const rect = element.getBoundingClientRect();
      return [
        {
          scope,
          camera: surface.camera,
          target: surface.target,
          pane: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        },
      ];
    });
    const next = advanceAiRequest(pendingJobs, views, cursor, direction);
    if (next) {
      setCursor(next.cursor);
      void reveal(next.job.id);
    }
  }
  if (paused || !jobs.length) return null;
  return (
    <>
      {pendingJobs.length > 0 &&
        createPortal(
          <button
            type="button"
            className="ai-prompt ai-requests-dock"
            data-theme={theme}
            data-docked-count={hiddenJobs.length}
            data-navigation-direction={cursor.direction}
            data-current-request={cursor.id ?? undefined}
            ref={dock}
            style={{ left: position.x, top: position.y, width: position.width }}
            aria-label="Passa alla selezione AI"
            aria-description="Scorre le selezioni verso l’alto e poi verso il basso. Usa le frecce su e giù per scegliere la direzione."
            title={`${cursor.direction === 'up' ? 'Selezione precedente' : 'Selezione successiva'} (${pendingJobs.length} in attesa)`}
            onClick={() => goToSelection()}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                goToSelection(event.key === 'ArrowUp' ? 'up' : 'down');
              }
            }}
          >
            <AiBuddy waiting />
          </button>,
          document.body,
        )}
      {displayJobs.map((job, order) => (
        <AiRequestBubble
          key={job.id}
          job={job}
          surface={surfaces.get(job.scope)}
          theme={theme}
          onDocked={onDocked}
          order={order}
        />
      ))}
    </>
  );
}

function AiRequestBubble({
  job,
  surface,
  theme,
  onDocked,
  order,
}: {
  job: AiJob;
  surface?: AiSurface;
  theme: Theme;
  onDocked: (id: string, docked: boolean) => void;
  order: number;
}) {
  const { dismiss, retry } = useAiRequests();
  const root = useRef<HTMLFormElement>(null);
  const missingAnchor = useRef<HTMLDivElement>(null);
  const pending = job.status === 'pending';
  const position = useAiPromptPosition({
    area: job.area,
    camera: surface?.camera ?? emptyCamera,
    anchor: surface?.anchor ?? missingAnchor,
    form: root,
    active: true,
    compact: pending,
    order,
  });
  const docked = pending && position.placement === 'page';
  useLayoutEffect(() => onDocked(job.id, docked), [job.id, docked, onDocked]);
  useLayoutEffect(() => () => onDocked(job.id, false), [job.id, onDocked]);
  const content = (
    <form
      ref={root}
      className={`ai-prompt ai-task${docked ? ' is-docked' : ''}`}
      data-theme={surface?.theme ?? theme}
      data-source={
        surface?.context ?? (job.scope.startsWith('pdf:') ? 'pdf' : 'notebook')
      }
      data-state={job.status}
      data-placement={position.placement}
      data-request-id={job.id}
      data-scope={job.scope}
      data-order={order}
      aria-hidden={docked}
      inert={docked}
      aria-label={pending ? `Richiesta AI: ${job.prompt}` : `Risposta AI: ${job.prompt}`}
      style={{ left: position.x, top: position.y, width: position.width }}
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss(job.id);
        }
      }}
    >
      <AiBuddy waiting={pending} />
      {pending ? (
        <>
          <button
            type="button"
            className="ai-close ai-buddy-cancel"
            aria-label="Annulla richiesta AI"
            title={`Interrompi: ${job.prompt}`}
            onClick={() => dismiss(job.id)}
          >
            <X size={15} />
          </button>
          <span className="sr-only" role="status">
            In attesa della risposta…
          </span>
        </>
      ) : (
        <div className="ai-prompt-content">
          <div className="ai-prompt-message">
            <div className="ai-request-text">{job.prompt}</div>
            <span className="ai-prompt-status" role="status">
              {job.status === 'success'
                ? 'Risposta ricevuta'
                : (job.error ?? 'Risposta non disponibile. Riprova.')}
            </span>
            {job.status === 'success' && (
              <div className="ai-prompt-response" tabIndex={0}>
                {job.response}
              </div>
            )}
          </div>
          <button
            type="button"
            className="ai-close"
            aria-label="Chiudi risposta AI"
            onClick={() => dismiss(job.id)}
          >
            <X size={16} />
          </button>
          {job.status === 'error' && (
            <button
              type="button"
              className="ai-send"
              aria-label="Riprova richiesta AI"
              onClick={() => retry(job.id)}
            >
              <RotateCcw size={17} />
            </button>
          )}
        </div>
      )}
    </form>
  );
  return createPortal(content, document.body);
}
