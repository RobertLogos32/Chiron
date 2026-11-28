import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AiAnswer,
  AiCapture,
  AiJob,
  AiPromptSender,
  AiSurface,
  AiTarget,
} from '../model/ai';
import type { Bounds } from '../model/types';
import { answerLocation } from '../lib/aiNavigation';
import { prepareAiWrites } from '../lib/prepareAiWrites';

type Requests = {
  jobs: AiJob[];
  surfaces: Map<string, AiSurface>;
  submit: (
    scope: string,
    area: Bounds,
    prompt: string,
    capture: AiCapture,
    lockScope?: string,
  ) => string;
  dismiss: (id: string) => void;
  retry: (id: string) => void;
  register: (scope: string, surface: AiSurface) => () => void;
  navigation: { jobId: string; scope: string; target?: AiTarget; area?: Bounds } | null;
  reveal: (id: string, where?: 'answer') => Promise<void>;
  registerNavigator: (navigate: (target: AiTarget) => Promise<boolean>) => () => void;
  /** The request reached last with the global buddy: Esc on its board cancels it. */
  selectedId: string | null;
  cancelSelected: (lockScope: string) => boolean;
  /** Cancels the requests that would write in a deleted notebook or PDF. */
  cancelResources: (resourceIds: string[]) => number;
  countResources: (resourceIds: string[]) => number;
};
const Context = createContext<Requests | null>(null);

/** Views of the same notebook or PDF page share a lock scope: `scope` or `scope:pane:id`. */
export const lockScopeOf = (scope: string) => scope.split(':pane:')[0];
/** A request still holds its area until its answer is on the board. */
export const holdsArea = (job: AiJob) => job.status === 'pending' || !!job.deferred;

function belongsTo(job: AiJob, resourceIds: Set<string>) {
  return [job.target?.resourceId, job.destination?.target?.resourceId].some(
    (id) => !!id && resourceIds.has(id),
  );
}

type WriteOutcome = Partial<AiJob> & { notReady?: boolean };

export function AiRequestsProvider({
  children,
  onSend,
}: {
  children: ReactNode;
  onSend?: AiPromptSender;
}) {
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [surfaces, setSurfaces] = useState(new Map<string, AiSurface>());
  const controllers = useRef(new Map<string, AbortController>());
  const [navigation, setNavigation] = useState<Requests['navigation']>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigator = useRef<((target: AiTarget) => Promise<boolean>) | null>(null);
  const latestJobs = useRef(jobs);
  const latestSurfaces = useRef(surfaces);
  const writing = useRef(new Set<string>());
  latestJobs.current = jobs;
  latestSurfaces.current = surfaces;
  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
    },
    [],
  );

  // Reloading would lose the requests still running and the answers not yet written.
  const unfinished = jobs.some(holdsArea);
  useEffect(() => {
    if (!unfinished) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unfinished]);

  /** Writes an answer in a view of its notebook or PDF page, if one is open and ready. */
  const writeAnswer = useCallback(
    async (job: AiJob, answer: AiAnswer, isCurrent: () => boolean) => {
      const destination = job.destination!;
      const lockScope = lockScopeOf(destination.scope);
      const find = () => {
        const own = latestSurfaces.current.get(destination.scope);
        if (own?.write && own.ready !== false) return destination.scope;
        return [...latestSurfaces.current].find(
          ([scope, surface]) =>
            lockScopeOf(scope) === lockScope && surface.write && surface.ready !== false,
        )?.[0];
      };
      const scope = find();
      if (!scope) return { deferred: true } as WriteOutcome;
      const surface = latestSurfaces.current.get(scope)!;
      const prepared = await prepareAiWrites(
        answer.writes,
        surface.context === 'pdf' ? 'light' : surface.theme,
        answer.writeStyle,
      );
      if (!isCurrent()) return null;
      const writer = latestSurfaces.current.get(scope)?.write;
      if (!writer) return { deferred: true } as WriteOutcome;
      const writeFailed = prepared.failed.length ? prepared.failed : undefined;
      if (!prepared.notes.length) return { deferred: false, writeFailed } as WriteOutcome;
      // The current request can write in its own selection; all other pending
      // selections on this notebook still reserve their space.
      const otherLockedAreas = latestJobs.current
        .filter(
          (item) =>
            item.id !== job.id &&
            holdsArea(item) &&
            (item.lockScope ?? item.scope) === (job.lockScope ?? job.scope),
        )
        .map((item) => item.area);
      const area = writer(
        prepared.notes,
        destination.area,
        otherLockedAreas,
        answer.writePlacement,
      );
      if (area === undefined) return { deferred: true, notReady: true } as WriteOutcome;
      if (area === null)
        return { deferred: false, writeBlocked: true, writeFailed } as WriteOutcome;
      return {
        deferred: false,
        written: { ...destination, scope, area },
        writeFailed,
      } as WriteOutcome;
    },
    [],
  );

  const run = useCallback(
    async (job: AiJob) => {
      const controller = new AbortController();
      controllers.current.set(job.id, controller);
      const isCurrent = () =>
        !controller.signal.aborted && controllers.current.get(job.id) === controller;
      try {
        if (!onSend || !job.capture) throw new Error('AI request is unavailable');
        const answer = await onSend(
          {
            scope: job.scope,
            prompt: job.prompt,
            selection: { ...job.area },
            ...job.capture,
            canWrite: !!job.destination,
          },
          controller.signal,
        );
        if (!isCurrent()) return;
        const patch =
          answer.writes.length && job.destination && !answer.showInReply
            ? await writeAnswer(job, answer, isCurrent)
            : {};
        if (!patch) return;
        const { notReady: _, ...result } = patch as WriteOutcome;
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? { ...item, ...result, status: 'success', answer, capture: undefined }
              : item,
          ),
        );
      } catch (failure) {
        if (!isCurrent()) return;
        const error = failure instanceof Error ? failure.message : undefined;
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id ? { ...item, status: 'error', error } : item,
          ),
        );
      } finally {
        if (controllers.current.get(job.id) === controller)
          controllers.current.delete(job.id);
      }
    },
    [onSend, writeAnswer],
  );

  // An answer that arrived while its page or notebook was closed is written when a view returns.
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    let waiting: ReturnType<typeof setTimeout> | undefined;
    for (const job of jobs) {
      if (!job.deferred || !job.answer || writing.current.has(job.id)) continue;
      writing.current.add(job.id);
      void writeAnswer(job, job.answer, () =>
        latestJobs.current.some((item) => item.id === job.id),
      )
        .then((outcome) => {
          if (!outcome) return;
          const { notReady, ...patch } = outcome as WriteOutcome;
          if (patch.deferred) {
            // The view is open but its page is still rendering: try again shortly.
            if (notReady)
              waiting ??= setTimeout(() => setRetryTick((tick) => tick + 1), 350);
            return;
          }
          setJobs((current) =>
            current.map((item) => (item.id === job.id ? { ...item, ...patch } : item)),
          );
        })
        .finally(() => writing.current.delete(job.id));
    }
    return () => clearTimeout(waiting);
  }, [jobs, surfaces, writeAnswer, retryTick]);

  const submit = useCallback(
    (
      scope: string,
      area: Bounds,
      value: string,
      capture: AiCapture,
      lockScope?: string,
    ) => {
      const prompt = value.trim();
      if (!prompt) return '';
      const surface = latestSurfaces.current.get(scope);
      const job: AiJob = {
        id: crypto.randomUUID(),
        scope,
        area: { ...area },
        prompt,
        capture,
        status: 'pending',
        lockScope,
        target: surface?.target,
        destination: surface?.write
          ? { scope, area: { ...area }, target: surface.target }
          : undefined,
      };
      setJobs((current) => [...current, job]);
      void run(job);
      return job.id;
    },
    [run],
  );
  const dismiss = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setJobs((current) => current.filter((job) => job.id !== id));
    setNavigation((current) => (current?.jobId === id ? null : current));
    setSelectedId((current) => (current === id ? null : current));
  }, []);
  const cancelSelected = useCallback(
    (lockScope: string) => {
      const job = latestJobs.current.find((item) => item.id === selectedId);
      if (!job || job.status !== 'pending' || (job.lockScope ?? job.scope) !== lockScope)
        return false;
      dismiss(job.id);
      return true;
    },
    [dismiss, selectedId],
  );
  const countResources = useCallback((resourceIds: string[]) => {
    const ids = new Set(resourceIds);
    return latestJobs.current.filter((job) => holdsArea(job) && belongsTo(job, ids))
      .length;
  }, []);
  const cancelResources = useCallback(
    (resourceIds: string[]) => {
      const ids = new Set(resourceIds);
      const cancelled = latestJobs.current.filter((job) => belongsTo(job, ids));
      cancelled.forEach((job) => dismiss(job.id));
      return cancelled.length;
    },
    [dismiss],
  );
  const retry = useCallback(
    (id: string) => {
      const job = jobs.find((item) => item.id === id);
      if (!job || job.status !== 'error' || controllers.current.has(id)) return;
      const next: AiJob = { ...job, status: 'pending', error: undefined };
      setJobs((current) => current.map((item) => (item.id === id ? next : item)));
      void run(next);
    },
    [jobs, run],
  );
  const register = useCallback((scope: string, surface: AiSurface) => {
    setSurfaces((current) => new Map(current).set(scope, surface));
    return () =>
      setSurfaces((current) => {
        if (current.get(scope) !== surface) return current;
        const next = new Map(current);
        next.delete(scope);
        return next;
      });
  }, []);
  const registerNavigator = useCallback(
    (navigate: (target: AiTarget) => Promise<boolean>) => {
      navigator.current = navigate;
      return () => {
        if (navigator.current === navigate) navigator.current = null;
      };
    },
    [],
  );
  const reveal = useCallback(async (id: string, where?: 'answer') => {
    const job = latestJobs.current.find((item) => item.id === id);
    if (!job) return;
    setSelectedId(id);
    const answer = where === 'answer' ? answerLocation(job) : undefined;
    const { scope, target } =
      answer ?? job.written ?? (job.deferred ? job.destination : undefined) ?? job;
    setNavigation({ jobId: id, scope, target, area: answer?.area });
    if (target && navigator.current) {
      try {
        if (!(await navigator.current(target)))
          setNavigation((current) => (current?.jobId === id ? null : current));
      } catch {
        setNavigation((current) => (current?.jobId === id ? null : current));
      }
    }
  }, []);
  useEffect(() => {
    if (!navigation) return;
    const scope =
      [...surfaces.keys()].find((key) => key === navigation.scope) ??
      [...surfaces.keys()].find(
        (key) => lockScopeOf(key) === lockScopeOf(navigation.scope),
      );
    const surface = scope ? surfaces.get(scope) : undefined;
    const element = surface?.anchor.current;
    if (
      !scope ||
      !surface?.reveal ||
      surface.ready === false ||
      !element?.checkVisibility() ||
      element.getBoundingClientRect().width <= 1
    )
      return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const job = latestJobs.current.find((item) => item.id === navigation.jobId);
        if (job)
          latestSurfaces.current
            .get(scope)
            ?.reveal?.(navigation.area ?? job.written?.area ?? job.area);
        setNavigation((current) =>
          current?.jobId === navigation.jobId ? null : current,
        );
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [navigation, surfaces]);
  return (
    <Context.Provider
      value={{
        jobs,
        surfaces,
        submit,
        dismiss,
        retry,
        register,
        navigation,
        reveal,
        registerNavigator,
        selectedId,
        cancelSelected,
        cancelResources,
        countResources,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAiRequests() {
  const requests = useContext(Context);
  if (!requests) throw new Error('AiRequestsProvider is required');
  return requests;
}

export function useAiScope(scope: string, lockScope = scope) {
  const { jobs, submit, cancelSelected } = useAiRequests();
  const areas = useMemo(
    () =>
      jobs
        .filter((job) => (job.lockScope ?? job.scope) === lockScope && holdsArea(job))
        .map((job) => job.area),
    [jobs, lockScope],
  );
  return {
    areas,
    submit: (area: Bounds, prompt: string, capture: AiCapture) =>
      submit(scope, area, prompt, capture, lockScope),
    cancelSelected: () => cancelSelected(lockScope),
  };
}

export function useAiSurface(scope: string, surface: AiSurface) {
  const { register } = useAiRequests();
  const { anchor, camera, theme, context, target, ready } = surface;
  const reveal = useRef(surface.reveal);
  reveal.current = surface.reveal;
  const write = useRef(surface.write);
  write.current = surface.write;
  const writable = !!surface.write;
  useLayoutEffect(
    () =>
      register(scope, {
        anchor,
        camera,
        theme,
        context,
        target,
        ready,
        reveal: (area) => reveal.current?.(area),
        write: writable
          ? (notes, area, otherLockedAreas, placement) =>
              write.current!(notes, area, otherLockedAreas, placement)
          : undefined,
      }),
    [
      register,
      scope,
      anchor,
      camera.x,
      camera.y,
      camera.zoom,
      theme,
      context,
      target?.kind,
      target?.resourceId,
      target?.page,
      target?.pageHeight,
      target?.paneId,
      ready,
      writable,
    ],
  );
}
