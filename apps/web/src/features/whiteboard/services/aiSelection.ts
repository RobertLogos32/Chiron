import type { AiPromptSender } from '../model/ai';

export const sendAiSelection: AiPromptSender = async ({ prompt, image }, signal) => {
  const response = await fetch('/api/ai/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image }),
    signal,
  }).catch(() => {
    throw new Error('Servizio AI non raggiungibile. Riprova.');
  });
  if (response.status === 429) {
    throw new Error('Limite di richieste raggiunto. Riprova tra poco.');
  }
  if (response.status === 503) {
    throw new Error('Configura la chiave OpenRouter per usare il cursore AI.');
  }
  if (!response.ok) throw new Error('Risposta non disponibile. Riprova.');
  const result: { response?: unknown } | null = await response.json().catch(() => null);
  if (typeof result?.response !== 'string' || !result.response.trim()) {
    throw new Error('Il servizio AI ha restituito una risposta vuota o illeggibile.');
  }
  return result.response;
};
