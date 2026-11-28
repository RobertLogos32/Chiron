import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Scan, TriangleAlert, X } from 'lucide-react';
import { lockScopeOf, useAiRequests } from '../../hooks/useAiRequests';
import { useAiPromptPosition } from '../../hooks/useAiPromptPosition';
import { useBoardAppearance } from '../../hooks/useBoardAppearance';
import { removePromptEcho } from '../../lib/aiResponseText';
import type { AiJob, AiSurface } from '../../model/ai';
import type { Theme } from '../../model/types';
import { themedVisualSvg } from '../../model/visual';
import { AiBuddy } from './AiBuddy';
import { AiAnnotationLinks } from './AiAnnotationLinks';
import {
  advanceAiRequest,
  answerLocation,
  type AiCursor,
  type AiDirection,
} from '../../lib/aiNavigation';

const emptyArea = { x: 0, y: 0, width: 0, height: 0 };
const emptyCamera = { x: 0, y: 0, zoom: 0 };
// On a phone the answers are stacked in one scrollable sheet instead of floating over the page.
const NARROW = '(max-width: 760px)';
// The global buddy also avoids the controls of the library and of the chat.
const DOCK_OBSTACLES =
  'button:not(.ai-requests-dock), a[href], input, select, textarea, h1, h2, h3';

function useNarrowScreen() {
  return useSyncExternalStore(
    (change) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener('change', change);
      return () => query.removeEventListener('change', change);
    },
    () => window.matchMedia(NARROW).matches,
  );
}

function isVisible(surface?: AiSurface) {
  const element = surface?.anchor.current;
  return (
    !!element && element.checkVisibility() && element.getBoundingClientRect().width > 1
  );
}

/** The view that shows a request: its own pane, or another view of the same page. */
function surfaceFor(job: AiJob, surfaces: Map<string, AiSurface>) {
  const { scope } = answerLocation(job);
  const own = surfaces.get(scope);
  if (isVisible(own)) return own;
  return [...surfaces].find(
    ([key, surface]) => lockScopeOf(key) === lockScopeOf(scope) && isVisible(surface),
  )?.[1];
}

export function AiRequestsLayer({ paused = false }: { paused?: boolean }) {
  const { jobs, surfaces, reveal } = useAiRequests();
  const { theme } = useBoardAppearance();
  const narrow = useNarrowScreen();
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
  const located = jobs.map((job) => ({ job, surface: surfaceFor(job, surfaces) }));
  const readyJobs = located
    .filter(
      ({ job, surface }) =>
        job.status !== 'pending' && (surface ? docked.has(job.id) : !!job.target),
    )
    .map(({ job }) => job);
  const focused = pendingJobs.find((job) => job.id === cursor.id);
  const ordered = focused
    ? [
        located.find(({ job }) => job.id === focused.id)!,
        ...located.filter(({ job }) => job.id !== focused.id),
      ]
    : located;
  const floating = ordered.filter(
    ({ job, surface }) => job.status === 'pending' || (!!surface && !narrow),
  );
  const stacked = ordered.filter(
    ({ job, surface }) => job.status !== 'pending' && (surface ? narrow : !job.target),
  );
  const dockVisible = pendingJobs.length > 0 || readyJobs.length > 0;
  const position = useAiPromptPosition({
    area: emptyArea,
    camera: emptyCamera,
    anchor,
    form: dock,
    active: !paused && dockVisible,
    compact: true,
    preferredWidth: 68,
    avoid: DOCK_OBSTACLES,
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
    const next = advanceAiRequest(pendingJobs, views, cursor, direction, readyJobs);
    if (next) {
      setCursor(next.cursor);
      void reveal(next.job.id, next.job.status === 'pending' ? undefined : 'answer');
    }
  }
  if (paused || !jobs.length) return null;
  const readyLabel =
    readyJobs.length === 1
      ? 'Una risposta AI è fuori vista'
      : `${readyJobs.length} risposte AI sono fuori vista`;
  return (
    <>
      {dockVisible &&
        createPortal(
          <button
            type="button"
            className="ai-prompt ai-requests-dock"
            data-theme={theme}
            data-docked-count={hiddenJobs.length}
            data-ready-count={readyJobs.length || undefined}
            data-navigation-direction={cursor.direction}
            data-current-request={cursor.id ?? undefined}
            ref={dock}
            style={{ left: position.x, top: position.y, width: position.width }}
            aria-label={
              pendingJobs.length
                ? readyJobs.length
                  ? 'Passa a una selezione o risposta AI'
                  : 'Passa alla selezione AI'
                : `${readyLabel}. Vai alla risposta.`
            }
            aria-description="Usa le frecce su e giù per scegliere la direzione."
            title={
              pendingJobs.length
                ? `${cursor.direction === 'up' ? 'Selezione precedente' : 'Selezione successiva'} (${pendingJobs.length} in attesa)${readyJobs.length ? ` · ${readyLabel}` : ''}`
                : readyLabel
            }
            onClick={() => goToSelection()}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                goToSelection(event.key === 'ArrowUp' ? 'up' : 'down');
              }
            }}
          >
            <AiBuddy waiting={pendingJobs.length > 0} />
            {readyJobs.length > 0 && (
              <span className="ai-ready-badge" aria-hidden="true">
                {readyJobs.length}
              </span>
            )}
          </button>,
          document.body,
        )}
      {floating.map(({ job, surface }, order) => (
        <AiRequestBubble
          key={job.id}
          job={job}
          surface={surface}
          theme={theme}
          onDocked={onDocked}
          order={order}
        />
      ))}
      {stacked.length > 0 &&
        createPortal(
          <div
            className={`ai-answer-stack${narrow ? ' is-narrow' : ''}`}
            role="region"
            aria-label="Risposte AI"
            aria-hidden={stacked.every(({ job }) => docked.has(job.id))}
          >
            {stacked.map(({ job, surface }) => (
              <AiRequestBubble
                key={job.id}
                job={job}
                surface={surface}
                theme={theme}
                onDocked={onDocked}
                order={-1}
                stacked
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function AiNotice({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="ai-write-warning" role="status">
      <div className="ai-write-warning-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  );
}

function AiRequestBubble({
  job,
  surface,
  theme,
  onDocked,
  order,
  stacked = false,
}: {
  job: AiJob;
  surface?: AiSurface;
  theme: Theme;
  onDocked: (id: string, docked: boolean) => void;
  order: number;
  stacked?: boolean;
}) {
  const { dismiss, retry, reveal } = useAiRequests();
  const root = useRef<HTMLFormElement>(null);
  const missingAnchor = useRef<HTMLDivElement>(null);
  const pending = job.status === 'pending';
  const answer = job.answer;
  const annotations = answer?.annotations;
  const failed = job.writeFailed ?? [];
  // Content that did not reach the board stays readable in the card.
  const shown = job.written || job.deferred ? [] : (answer?.writes ?? []);
  const visuals = shown.flatMap((write) => (write.kind === 'visual' ? [write] : []));
  const texts = shown
    .filter((write) => write.kind !== 'visual' && !failed.includes(write.content))
    .map((write) => write.content);
  const response = [
    removePromptEcho(
      answer?.response ?? '',
      job.prompt,
      !!(annotations?.length || shown.length || job.written || failed.length),
    ),
    ...texts,
  ]
    .filter(Boolean)
    .join('\n\n');
  const pdf = (job.destination?.scope ?? job.scope).startsWith('pdf:');
  const writtenOnly =
    !!job.written && !annotations?.length && !response && !failed.length;
  const wide = job.writeBlocked || visuals.length > 0 || failed.length > 0;
  const position = useAiPromptPosition({
    area: answerLocation(job).area,
    camera: surface?.camera ?? emptyCamera,
    anchor: surface?.anchor ?? missingAnchor,
    form: root,
    active: !stacked || !!surface,
    compact: pending,
    dockWhenOffscreen: !pending && !!surface,
    preferredWidth: writtenOnly ? 305 : wide ? 390 : undefined,
    order,
  });
  const docked = (pending || !!surface) && position.placement === 'page';
  useLayoutEffect(() => onDocked(job.id, docked), [job.id, docked, onDocked]);
  useLayoutEffect(() => () => onDocked(job.id, false), [job.id, onDocked]);
  const surfaceTheme = surface?.theme ?? theme;
  const page = job.destination?.target?.page;
  let notice: ReactNode = null;
  if (job.writeBlocked)
    notice = (
      <AiNotice
        icon={<Scan size={18} />}
        title={pdf ? 'Non ho scritto sul PDF' : 'Non ho scritto sulla lavagna'}
      >
        <span>
          Serve più spazio.{' '}
          {pdf
            ? 'Scegli una zona più libera della pagina.'
            : 'Allarga la selezione o scegli una zona più libera.'}{' '}
          Il contenuto è qui sotto.
        </span>
      </AiNotice>
    );
  else if (failed.length)
    notice = (
      <AiNotice
        icon={<TriangleAlert size={18} />}
        title={
          job.written
            ? `Inserimento parziale: ${failed.length === 1 ? 'una formula non è stata convertita' : `${failed.length} formule non sono state convertite`}`
            : 'Nessuna formula è stata convertita'
        }
      >
        <span>Correggi {failed.length === 1 ? 'questa formula' : 'queste formule'}:</span>
        <ul className="ai-failed-formulas">
          {failed.map((formula, index) => (
            <li key={index}>
              <code>{formula}</code>
            </li>
          ))}
        </ul>
      </AiNotice>
    );
  const status =
    job.status === 'error'
      ? (job.error ?? 'Risposta non disponibile. Riprova.')
      : job.deferred
        ? pdf
          ? `Risposta pronta: verrà aggiunta al PDF quando torni ${page ? `alla pagina ${page}` : 'alla pagina'}.`
          : 'Risposta pronta: verrà aggiunta quando riapri il quaderno.'
        : job.written
          ? pdf
            ? 'Annotazione aggiunta al PDF'
            : 'Contenuto aggiunto alla lavagna'
          : 'Risposta ricevuta';
  const content = (
    <form
      ref={root}
      className={`ai-prompt ai-task${docked ? ' is-docked' : ''}${stacked ? ' is-stacked' : ''}`}
      data-theme={surfaceTheme}
      data-source={surface?.context ?? (pdf ? 'pdf' : 'notebook')}
      data-state={job.status}
      data-placement={stacked ? 'stack' : position.placement}
      data-request-id={job.id}
      data-scope={job.scope}
      data-order={stacked ? undefined : order}
      aria-hidden={docked}
      inert={docked}
      aria-label={pending ? `Richiesta AI: ${job.prompt}` : `Risposta AI: ${job.prompt}`}
      style={
        stacked ? undefined : { left: position.x, top: position.y, width: position.width }
      }
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
        <div className={`ai-prompt-content${notice ? ' is-write-blocked' : ''}`}>
          <div className="ai-prompt-message">
            <div className="ai-request-text">{job.prompt}</div>
            {notice ?? (
              <span className="ai-prompt-status" role="status">
                {status}
              </span>
            )}
            {(job.written || (job.deferred && job.target)) && (
              <button
                type="button"
                className="ai-written-reveal"
                onClick={() => void reveal(job.id)}
              >
                {job.deferred ? 'Vai alla pagina' : 'Vai al contenuto'}
              </button>
            )}
            {(response || !!annotations?.length || visuals.length > 0) && (
              <div
                className={
                  annotations?.length
                    ? 'ai-prompt-response has-annotations'
                    : 'ai-prompt-response'
                }
                tabIndex={0}
              >
                {response}
                {visuals.map((write, index) => (
                  <img
                    key={index}
                    className="ai-reply-visual"
                    alt={write.content}
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(themedVisualSvg(write.visual.svg, surfaceTheme))}`}
                  />
                ))}
                {!!annotations?.length && (
                  <ol
                    className="ai-explanation-steps"
                    aria-label="Passaggi della spiegazione"
                  >
                    {annotations.map((step, index) => (
                      <li key={index}>
                        <span className="ai-explanation-number" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span>{step.explanation}</span>
                      </li>
                    ))}
                  </ol>
                )}
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
  const links = !docked && !!annotations?.length && surface && (
    <AiAnnotationLinks
      area={job.area}
      annotations={annotations}
      surface={surface}
      form={root}
      position={position}
    />
  );
  if (stacked)
    return (
      <>
        {links && createPortal(links, document.body)}
        {content}
      </>
    );
  return createPortal(
    <>
      {links}
      {content}
    </>,
    document.body,
  );
}
