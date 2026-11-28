import type { AiPromptSender, AiWrite, ExplainedRegion } from '../model/ai';
import { isBoardVisual } from '../model/visual';

function isExplainedRegion(value: unknown): value is ExplainedRegion {
  if (!value || typeof value !== 'object') return false;
  const { left, top, right, bottom, explanation } = value as Partial<ExplainedRegion>;
  return (
    typeof left === 'number' &&
    typeof top === 'number' &&
    typeof right === 'number' &&
    typeof bottom === 'number' &&
    [left, top, right, bottom].every(
      (coordinate) =>
        Number.isInteger(coordinate) && coordinate >= 0 && coordinate <= 1000,
    ) &&
    right > left &&
    bottom > top &&
    typeof explanation === 'string' &&
    !!explanation.trim()
  );
}

function isAiWrite(value: unknown): value is AiWrite {
  if (!value || typeof value !== 'object') return false;
  const { kind, content, visual } = value as {
    kind?: unknown;
    content?: unknown;
    visual?: unknown;
  };
  if (typeof content !== 'string' || !content.trim()) return false;
  if (kind === 'visual') return content.length <= 160 && isBoardVisual(visual);
  return (
    (kind === 'text' || kind === 'latex') &&
    content.length <= (kind === 'latex' ? 4000 : 12000)
  );
}

export const sendAiSelection: AiPromptSender = async (
  { prompt, image, guide, source, canWrite },
  signal,
) => {
  const response = await fetch('/api/ai/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image, guide, source, can_write: canWrite }),
    signal,
  }).catch(() => {
    throw new Error('Servizio AI non raggiungibile. Riprova.');
  });
  if (response.status === 429) {
    // The agent tells a daily quota apart from a per-minute limit, with the wait.
    const detail = await response
      .json()
      .then((body: { detail?: unknown }) => body?.detail)
      .catch(() => undefined);
    throw new Error(
      typeof detail === 'string' && detail.trim()
        ? detail
        : 'Limite di richieste raggiunto. Riprova tra poco.',
    );
  }
  if (response.status === 503) {
    throw new Error('Controlla il provider e la chiave API del cursore AI.');
  }
  if (!response.ok) throw new Error('Risposta non disponibile. Riprova.');
  const result: {
    response?: unknown;
    annotations?: unknown;
    writes?: unknown;
    write_placement?: unknown;
    write_style?: unknown;
    show_in_reply?: unknown;
  } | null = await response.json().catch(() => null);
  const annotations = Array.isArray(result?.annotations)
    ? result.annotations.filter(isExplainedRegion).slice(0, 8)
    : [];
  const text = typeof result?.response === 'string' ? result.response.trim() : '';
  const writes = Array.isArray(result?.writes)
    ? result.writes.filter(isAiWrite).slice(0, 16)
    : [];
  if (!text && !annotations.length && !writes.length) {
    throw new Error('Il servizio AI ha restituito una risposta vuota o illeggibile.');
  }
  return {
    response: text,
    annotations,
    writes,
    writePlacement: result?.write_placement === 'below' ? 'below' : undefined,
    writeStyle:
      result?.write_style === 'note' || result?.write_style === 'solution'
        ? result.write_style
        : undefined,
    showInReply: result?.show_in_reply === true,
  };
};
