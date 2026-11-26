import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Sparkles, X } from 'lucide-react';
import type { Bounds, Camera, Theme } from '../../model/types';
import type { AiPromptRequest } from '../../model/ai';
import { useAiPromptPosition } from '../../hooks/useAiPromptPosition';
export type { AiPromptRequest, AiPromptSender } from '../../model/ai';

export function AiPrompt({
  area,
  camera,
  anchor,
  theme,
  active = true,
  context = 'notebook',
  onClose,
  onSend,
}: {
  area: Bounds;
  camera: Camera;
  anchor: RefObject<HTMLDivElement | null>;
  theme: Theme;
  active?: boolean;
  context?: 'pdf' | 'notebook';
  onClose: () => void;
  onSend: (request: AiPromptRequest) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [captureError, setCaptureError] = useState(false);
  const root = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const submitted = useRef(false);
  const position = useAiPromptPosition({ area, camera, anchor, form: root, active });
  useEffect(() => {
    if (active) textarea.current?.focus({ preventScroll: true });
  }, [active]);
  useLayoutEffect(() => {
    const input = textarea.current;
    if (!active || !input) return;
    input.style.height = '24px';
    input.style.height = `${Math.min(72, Math.max(24, input.scrollHeight))}px`;
  }, [active, prompt]);
  function send(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || submitted.current) return;
    submitted.current = true;
    try {
      onSend({ prompt: text, selection: { ...area } });
    } catch {
      submitted.current = false;
      setCaptureError(true);
      return;
    }
    onClose();
  }
  if (!active) return null;
  return createPortal(
    <form
      ref={root}
      className="ai-prompt"
      data-theme={theme}
      data-source={context}
      data-state={captureError ? 'error' : 'idle'}
      data-placement={position.placement}
      aria-label="Prompt AI per l’area selezionata"
      style={{ left: position.x, top: position.y, width: position.width }}
      onSubmit={send}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing &&
          (event.target === textarea.current || event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault();
          send();
        }
      }}
    >
      <div className="ai-prompt-content">
        <Sparkles className="ai-prompt-icon" size={18} aria-hidden="true" />
        <div className="ai-prompt-message">
          <textarea
            ref={textarea}
            aria-label="Prompt AI"
            placeholder="Chiedi qualcosa su quest’area…"
            value={prompt}
            maxLength={4000}
            rows={1}
            onChange={(event) => setPrompt(event.target.value)}
          />
          {captureError && (
            <span className="ai-prompt-status" role="alert">
              Impossibile acquisire l’area. Riprova.
            </span>
          )}
        </div>
        <button
          type="button"
          className="ai-close"
          aria-label="Chiudi prompt AI"
          title="Chiudi (Esc)"
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <button
          className="ai-send"
          type="submit"
          aria-label="Invia prompt AI"
          title="Invia (Invio)"
          disabled={!prompt.trim()}
        >
          <Check size={20} />
        </button>
      </div>
    </form>,
    document.body,
  );
}
