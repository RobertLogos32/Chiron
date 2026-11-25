import { useEffect, useRef, useState } from 'react';
import { createDemoReply } from '../model/chatDemo';

export type ChatMaterial = { id: string; name: string; kind: 'pdf' | 'notebook' };
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  materials?: ChatMaterial[];
  status?: 'streaming' | 'done' | 'stopped';
};
type Generation = { id: string; text: string };

export function useDemoChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const generationId = useRef<string | null>(null);
  const variant = useRef(0);
  useEffect(() => {
    if (!generation) return;
    let length = 0;
    const timer = window.setInterval(() => {
      if (generationId.current !== generation.id) return;
      length = Math.min(generation.text.length, length + 28);
      const done = length === generation.text.length;
      setMessages((current) =>
        current.map((message) =>
          message.id === generation.id
            ? {
                ...message,
                text: generation.text.slice(0, length),
                status: done ? 'done' : 'streaming',
              }
            : message,
        ),
      );
      if (done) {
        generationId.current = null;
        setGeneration(null);
        window.clearInterval(timer);
      }
    }, 32);
    return () => window.clearInterval(timer);
  }, [generation]);

  function begin(before: ChatMessage[], prompt: string, materials: ChatMaterial[] = []) {
    const id = crypto.randomUUID();
    generationId.current = id;
    setMessages([...before, { id, role: 'assistant', text: '', status: 'streaming' }]);
    setGeneration({
      id,
      text: createDemoReply(prompt, materials.length, variant.current++),
    });
  }
  function send(text: string, materials: ChatMaterial[]) {
    if (!text.trim() || generationId.current) return false;
    begin(
      [
        ...messages,
        { id: crypto.randomUUID(), role: 'user', text: text.trim(), materials },
      ],
      text,
      materials,
    );
    return true;
  }
  function stop() {
    const id = generationId.current;
    generationId.current = null;
    setGeneration(null);
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, status: 'stopped' } : message,
      ),
    );
  }
  function regenerate() {
    if (generationId.current) return;
    const last = messages.map((message) => message.role).lastIndexOf('user');
    if (last < 0) return;
    const message = messages[last];
    begin(messages.slice(0, last + 1), message.text, message.materials);
  }
  function edit(id: string, text: string) {
    if (!text.trim() || generationId.current) return;
    const index = messages.findIndex(
      (message) => message.id === id && message.role === 'user',
    );
    if (index < 0) return;
    const message = { ...messages[index], text: text.trim() };
    begin([...messages.slice(0, index), message], message.text, message.materials);
  }
  function reset() {
    generationId.current = null;
    setGeneration(null);
    setMessages([]);
    variant.current = 0;
  }
  return {
    messages,
    generating: generation !== null,
    send,
    stop,
    regenerate,
    edit,
    reset,
  };
}
