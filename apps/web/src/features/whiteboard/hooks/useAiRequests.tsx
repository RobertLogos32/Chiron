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
import type { AiJob, AiPromptSender, AiSurface, AiTarget } from '../model/ai';
import type { Bounds } from '../model/types';

type Requests = {
  jobs: AiJob[];
  surfaces: Map<string, AiSurface>;
  submit: (scope: string, area: Bounds, prompt: string, lockScope?: string) => string;
  dismiss: (id: string) => void;
  retry: (id: string) => void;
  register: (scope: string, surface: AiSurface) => () => void;
  navigation: { jobId: string; scope: string; target?: AiTarget } | null;
  reveal: (id: string) => Promise<void>;
  registerNavigator: (navigate: (target: AiTarget) => Promise<boolean>) => () => void;
};
const Context = createContext<Requests | null>(null);

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
  const navigator = useRef<((target: AiTarget) => Promise<boolean>) | null>(null);
  const latestJobs = useRef(jobs);
  const latestSurfaces = useRef(surfaces);
  latestJobs.current = jobs;
  latestSurfaces.current = surfaces;
  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
    },
    [],
  );

  const run = useCallback(
    async (job: AiJob) => {
      const controller = new AbortController();
      controllers.current.set(job.id, controller);
      // Frontend preview: a job waits until cancelled. Only an injected sender
      // can produce an answer; there is no fabricated response or completion timer.
      if (!onSend) return;
      try {
        const response = await onSend(
          { scope: job.scope, prompt: job.prompt, selection: { ...job.area } },
          controller.signal,
        );
        if (controller.signal.aborted || controllers.current.get(job.id) !== controller)
          return;
        if (!response.trim()) throw new Error('Empty AI response');
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id ? { ...item, status: 'success', response } : item,
          ),
        );
      } catch {
        if (controller.signal.aborted || controllers.current.get(job.id) !== controller)
          return;
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id ? { ...item, status: 'error' } : item,
          ),
        );
      } finally {
        if (controllers.current.get(job.id) === controller)
          controllers.current.delete(job.id);
      }
    },
    [onSend],
  );

  const submit = useCallback(
    (scope: string, area: Bounds, value: string, lockScope?: string) => {
      const prompt = value.trim();
      if (!prompt) return '';
      const job: AiJob = {
        id: crypto.randomUUID(),
        scope,
        area: { ...area },
        prompt,
        status: 'pending',
        lockScope,
        target: latestSurfaces.current.get(scope)?.target,
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
  }, []);
  const retry = useCallback(
    (id: string) => {
      const job = jobs.find((item) => item.id === id);
      if (!job || job.status !== 'error' || controllers.current.has(id)) return;
      const next: AiJob = { ...job, status: 'pending' };
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
  const reveal = useCallback(async (id: string) => {
    const job = latestJobs.current.find(
      (item) => item.id === id && item.status === 'pending',
    );
    if (!job) return;
    setNavigation({ jobId: id, scope: job.scope, target: job.target });
    if (job.target && navigator.current) {
      try {
        if (!(await navigator.current(job.target)))
          setNavigation((current) => (current?.jobId === id ? null : current));
      } catch {
        setNavigation((current) => (current?.jobId === id ? null : current));
      }
    }
  }, []);
  useEffect(() => {
    if (!navigation) return;
    const surface = surfaces.get(navigation.scope);
    const element = surface?.anchor.current;
    if (
      !surface?.reveal ||
      surface.ready === false ||
      !element?.checkVisibility() ||
      element.getBoundingClientRect().width <= 1
    )
      return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const job = latestJobs.current.find(
          (item) => item.id === navigation.jobId && item.status === 'pending',
        );
        if (job) latestSurfaces.current.get(navigation.scope)?.reveal?.(job.area);
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
  const { jobs, submit } = useAiRequests();
  const areas = useMemo(
    () =>
      jobs
        .filter(
          (job) => (job.lockScope ?? job.scope) === lockScope && job.status === 'pending',
        )
        .map((job) => job.area),
    [jobs, lockScope],
  );
  return {
    areas,
    submit: (area: Bounds, prompt: string) => submit(scope, area, prompt, lockScope),
  };
}

export function useAiSurface(scope: string, surface: AiSurface) {
  const { register } = useAiRequests();
  const { anchor, camera, theme, context, target, ready } = surface;
  const reveal = useRef(surface.reveal);
  reveal.current = surface.reveal;
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
    ],
  );
}
