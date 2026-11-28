function normalizeEcho(text: string): string {
  return text
    .normalize('NFC')
    .replace(/^[\s"'‘’“”«»*`]+|[\s"'‘’“”«»*`.?!]+$/g, '')
    .replace(/[\s'‘’]+/g, ' ')
    .toLowerCase();
}

// «Ripeti esattamente questa frase» asks for the prompt itself as the answer.
const ASKS_FOR_REPETITION =
  /\b(?:ripet\w*|ricopia\w*|riscrivi\w*\s+(?:esattamente|uguale)|parola per parola|repeat)\b/i;

/**
 * Drops a copy of the request at the top of the answer. When the answer is nothing but
 * that copy and there is nothing else to show, it is kept: the request may have asked for it.
 */
export function removePromptEcho(
  response: string,
  prompt: string,
  hasOtherContent = true,
): string {
  if (!response) return '';
  const normalizedPrompt = normalizeEcho(prompt);
  if (!normalizedPrompt || ASKS_FOR_REPETITION.test(prompt)) return response;
  const cleaned =
    normalizeEcho(response) === normalizedPrompt
      ? ''
      : response
          .split(/\r?\n/)
          .filter((line) => normalizeEcho(line) !== normalizedPrompt)
          .join('\n')
          .trim();
  return cleaned || hasOtherContent ? cleaned : response;
}
