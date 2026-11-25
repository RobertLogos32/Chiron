import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  FileText,
  GraduationCap,
  Lightbulb,
  ListFilter,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  Square,
  X,
} from 'lucide-react';
import type { StudyResource, Subject } from '../model/library';
import { useDemoChat, type ChatMaterial } from '../hooks/useDemoChat';
import { ChatAiIcon } from './ChatAiIcon';

const suggestions = [
  {
    icon: Lightbulb,
    title: 'Capire un concetto',
    detail: 'Un esempio, passo dopo passo',
    prompt: 'Spiegami la fotosintesi con un esempio semplice.',
  },
  {
    icon: ListFilter,
    title: 'Fare chiarezza',
    detail: 'Le idee essenziali, in ordine',
    prompt: 'Mostrami un riassunto sul metodo di studio.',
  },
  {
    icon: GraduationCap,
    title: 'Mettermi alla prova',
    detail: 'Qualche domanda per ripassare',
    prompt: 'Fammi tre domande per ripassare la memoria.',
  },
];

export function StudyChat({
  active,
  subject,
  resources,
  renderControls,
}: {
  active: boolean;
  subject: Subject;
  resources: StudyResource[];
  renderControls: (newChat: () => void) => ReactNode;
}) {
  const chat = useDemoChat();
  const [draft, setDraft] = useState('');
  const [materials, setMaterials] = useState<ChatMaterial[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const lastScrollTop = useRef(0);
  const context = useRef<HTMLDivElement>(null);
  const attach = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const contextId = useId();
  const hintId = useId();

  useEffect(() => {
    // Opening a chat should not summon the keyboard on touch devices.
    // Activating an existing pane must also preserve focus on its header controls.
    const pane = root.current?.closest('.study-editor-pane');
    if (
      active &&
      !contextOpen &&
      !editing &&
      !pane?.contains(document.activeElement) &&
      window.matchMedia('(hover: hover)').matches
    )
      input.current?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  useLayoutEffect(() => {
    const element = composer.current;
    if (!element) return;
    let width = 0;
    const observer = new ResizeObserver(() => {
      if (input.current && element.clientWidth !== width) {
        width = element.clientWidth;
        input.current.style.height = '28px';
        input.current.style.height = `${Math.min(168, input.current.scrollHeight)}px`;
      }
      root.current?.style.setProperty(
        '--chat-composer-height',
        `${element.offsetHeight}px`,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = '28px';
    input.current.style.height = `${Math.min(168, input.current.scrollHeight)}px`;
  }, [draft]);
  useLayoutEffect(() => {
    const element = editInput.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [editing, editText]);
  useLayoutEffect(() => {
    const element = editInput.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [editing]);
  useLayoutEffect(() => {
    const element = feed.current;
    if (!element) return;
    if (element.scrollTop < lastScrollTop.current - 2) follow.current = false;
    if (follow.current) element.scrollTop = element.scrollHeight;
    lastScrollTop.current = element.scrollTop;
    setShowLatest(element.scrollHeight - element.scrollTop - element.clientHeight > 100);
  }, [chat.messages]);
  useEffect(() => {
    if (!contextOpen) return;
    function dismiss(event: PointerEvent) {
      if (
        !context.current?.contains(event.target as Node) &&
        !attach.current?.contains(event.target as Node)
      )
        setContextOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setContextOpen(false);
        attach.current?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape, true);
    };
  }, [contextOpen]);

  function send(event?: FormEvent) {
    event?.preventDefault();
    if (editing || !chat.send(draft, materials)) return;
    setDraft('');
    setMaterials([]);
    setContextOpen(false);
    setNotice('');
    follow.current = true;
    lastScrollTop.current = 0;
    input.current?.focus({ preventScroll: true });
  }
  function reset() {
    chat.reset();
    setDraft('');
    setMaterials([]);
    setEditing(null);
    setContextOpen(false);
    setNotice('Nuova conversazione pronta.');
    follow.current = true;
    lastScrollTop.current = 0;
    input.current?.focus({ preventScroll: true });
  }
  function cancelEdit() {
    const id = editing;
    setEditing(null);
    requestAnimationFrame(() => {
      const button =
        id &&
        root.current?.querySelector<HTMLButtonElement>(
          `[data-message-id="${CSS.escape(id)}"] button[aria-label="Modifica messaggio"]`,
        );
      if (button) button.focus({ preventScroll: true });
      else input.current?.focus({ preventScroll: true });
    });
  }
  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setNotice('Risposta copiata.');
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setNotice('Copia non disponibile. Puoi selezionare e copiare il testo.');
    }
  }
  const visibleResources = resources.filter((item) =>
    item.name.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it')),
  );
  const lastAssistant = [...chat.messages]
    .reverse()
    .find((message) => message.role === 'assistant')?.id;
  return (
    <div
      ref={root}
      className={`chiron-chat${chat.messages.length ? ' has-messages' : ''}`}
    >
      {renderControls(reset)}
      <div className="chiron-chat-stage">
        <div
          ref={feed}
          className="chiron-chat-feed"
          role="log"
          aria-label="Messaggi della chat AI"
          aria-live="off"
          onWheel={(event) => {
            if (event.deltaY < 0) follow.current = false;
          }}
          onTouchStart={() => {
            follow.current = false;
          }}
          onScroll={() => {
            const element = feed.current;
            if (!element) return;
            follow.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 100;
            lastScrollTop.current = element.scrollTop;
            setShowLatest(!follow.current);
          }}
        >
          {!chat.messages.length ? (
            <div className="chiron-chat-welcome">
              <div className="chiron-chat-mark" aria-hidden="true">
                <ChatAiIcon size={52} />
              </div>
              <p className="chiron-chat-eyebrow">IL TUO SPAZIO PER CAPIRE</p>
              <h2>Da dove iniziamo?</h2>
              <p>
                Una domanda, un dubbio, un’idea.
                <br />
                Facciamo spazio a quello che vuoi imparare.
              </p>
            </div>
          ) : (
            <div className="chiron-chat-thread">
              {chat.messages.map((message) => (
                <article
                  key={message.id}
                  className={`chiron-chat-message is-${message.role}${editing === message.id ? ' is-editing' : ''}`}
                  data-message-id={message.id}
                  aria-label={
                    message.role === 'user'
                      ? 'Messaggio tuo'
                      : 'Risposta dimostrativa di Chiron'
                  }
                >
                  {message.role === 'assistant' && (
                    <div className="chiron-chat-author">
                      <ChatAiIcon size={26} />
                      Chiron <small>Esempio</small>
                    </div>
                  )}
                  {!!message.materials?.length && (
                    <div className="chiron-chat-message-materials">
                      {message.materials.map((item) => (
                        <span key={item.id}>
                          {item.kind === 'pdf' ? (
                            <FileText size={13} />
                          ) : (
                            <BookOpen size={13} />
                          )}
                          {item.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {editing === message.id ? (
                    <form
                      className="chiron-chat-edit"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!editText.trim()) return;
                        chat.edit(message.id, editText);
                        setEditing(null);
                        follow.current = true;
                        input.current?.focus({ preventScroll: true });
                      }}
                    >
                      <label htmlFor={`${contextId}-edit`}>Modifica il messaggio</label>
                      <textarea
                        ref={editInput}
                        id={`${contextId}-edit`}
                        aria-describedby={`${contextId}-edit-note`}
                        autoFocus
                        rows={1}
                        maxLength={8000}
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelEdit();
                          }
                          if (
                            event.key === 'Enter' &&
                            (event.ctrlKey || event.metaKey) &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                      <p id={`${contextId}-edit-note`}>
                        I messaggi successivi verranno sostituiti.
                      </p>
                      <div>
                        <button type="button" onClick={cancelEdit}>
                          Annulla
                        </button>
                        <button
                          type="submit"
                          disabled={!editText.trim()}
                          title="Salva e invia (Ctrl + Invio)"
                        >
                          Salva e invia
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="chiron-chat-message-body">
                      {message.role === 'user' ? (
                        message.text
                      ) : message.text ? (
                        <ChatText text={message.text} />
                      ) : (
                        <span
                          className="chiron-chat-typing"
                          aria-label="Preparazione dell’esempio"
                        >
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                    </div>
                  )}
                  {message.status === 'stopped' && (
                    <p className="chiron-chat-stopped">Risposta interrotta</p>
                  )}
                  {!editing && message.role === 'user' && !chat.generating && (
                    <div className="chiron-chat-message-actions">
                      <button
                        title="Modifica messaggio"
                        aria-label="Modifica messaggio"
                        onClick={() => {
                          setEditText(message.text);
                          setEditing(message.id);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                  {message.role === 'assistant' && message.status !== 'streaming' && (
                    <div className="chiron-chat-message-actions">
                      <button
                        title={copied === message.id ? 'Copiata' : 'Copia risposta'}
                        aria-label={
                          copied === message.id ? 'Risposta copiata' : 'Copia risposta'
                        }
                        disabled={!message.text}
                        onClick={() => void copy(message.id, message.text)}
                      >
                        {copied === message.id ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                      {message.id === lastAssistant && (
                        <button
                          title="Rigenera esempio"
                          aria-label="Rigenera esempio"
                          disabled={chat.generating || !!editing}
                          onClick={() => {
                            follow.current = true;
                            chat.regenerate();
                          }}
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
        {showLatest && (
          <button
            className="chiron-chat-latest"
            aria-label="Vai all’ultimo messaggio"
            onClick={() => {
              follow.current = true;
              feed.current?.scrollTo({ top: feed.current.scrollHeight });
              setShowLatest(false);
            }}
          >
            <ArrowDown size={17} />
          </button>
        )}
        <div ref={composer} className="chiron-chat-composer-wrap">
          <div className="chiron-chat-composer-inner">
            {contextOpen && (
              <div
                ref={context}
                id={contextId}
                className="chiron-chat-context"
                role="dialog"
                aria-label="Aggiungi materiali alla chat"
              >
                <div className="chiron-chat-context-heading">
                  <strong>I materiali di {subject.name}</strong>
                  <button
                    aria-label="Chiudi materiali"
                    onClick={() => {
                      setContextOpen(false);
                      attach.current?.focus();
                    }}
                  >
                    <X size={17} />
                  </button>
                </div>
                <p>Scegli il contesto del messaggio. La demo non legge i contenuti.</p>
                {!!resources.length && (
                  <label className="chiron-chat-context-search">
                    <Search size={15} />
                    <input
                      autoFocus
                      aria-label="Cerca materiali per la chat"
                      placeholder="Cerca un materiale…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                )}
                <div className="chiron-chat-context-list">
                  {visibleResources.length ? (
                    visibleResources.map((item) => {
                      const selected = materials.some(
                        (material) => material.id === item.id,
                      );
                      return (
                        <button
                          key={item.id}
                          aria-pressed={selected}
                          onClick={() =>
                            setMaterials((current) =>
                              selected
                                ? current.filter((material) => material.id !== item.id)
                                : [
                                    ...current,
                                    { id: item.id, name: item.name, kind: item.kind },
                                  ],
                            )
                          }
                        >
                          {item.kind === 'pdf' ? (
                            <FileText size={18} />
                          ) : (
                            <BookOpen size={18} />
                          )}
                          <span>
                            {item.name}
                            <small>
                              {item.kind === 'pdf' ? 'Documento PDF' : 'Quaderno'}
                            </small>
                          </span>
                          <span
                            className={`chiron-chat-checkbox${selected ? ' is-checked' : ''}`}
                          >
                            {selected && <Check size={13} />}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p>
                      {resources.length
                        ? 'Nessun materiale trovato.'
                        : 'Aggiungi un PDF o un quaderno dalla libreria per ritrovarlo qui.'}
                    </p>
                  )}
                </div>
                <button
                  className="chiron-chat-context-done"
                  onClick={() => {
                    setContextOpen(false);
                    input.current?.focus();
                  }}
                >
                  Fatto{materials.length ? ` · ${materials.length} selezionati` : ''}
                </button>
              </div>
            )}
            <form className="chiron-chat-composer" onSubmit={send}>
              {!!materials.length && (
                <div className="chiron-chat-attachments">
                  {materials.map((item) => (
                    <span key={item.id}>
                      {item.kind === 'pdf' ? (
                        <FileText size={14} />
                      ) : (
                        <BookOpen size={14} />
                      )}
                      <span title={item.name}>{item.name}</span>
                      <button
                        type="button"
                        aria-label={`Rimuovi ${item.name} dal messaggio`}
                        onClick={() =>
                          setMaterials((current) =>
                            current.filter((material) => material.id !== item.id),
                          )
                        }
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={input}
                aria-label="Scrivi alla chat AI"
                aria-describedby={hintId}
                placeholder="Chiedi, esplora, collega le idee…"
                value={draft}
                maxLength={8000}
                rows={1}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <div className="chiron-chat-compose-tools">
                <button
                  ref={attach}
                  type="button"
                  className="chiron-chat-attach"
                  aria-label="Aggiungi materiali"
                  aria-expanded={contextOpen}
                  aria-controls={contextId}
                  onClick={() => {
                    setSearch('');
                    setContextOpen((value) => !value);
                  }}
                >
                  <Paperclip size={17} />
                  <span>Materiali</span>
                  {!!materials.length && <small>{materials.length}</small>}
                </button>
                <span className="chiron-chat-mode">
                  <ChatAiIcon size={14} />
                  Modalità demo
                </span>
                {chat.generating ? (
                  <button
                    type="button"
                    className="chiron-chat-send"
                    aria-label="Interrompi risposta"
                    title="Interrompi risposta"
                    onClick={chat.stop}
                  >
                    <Square size={15} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="chiron-chat-send"
                    aria-label="Invia messaggio alla chat"
                    title="Invia messaggio"
                    disabled={!draft.trim() || !!editing}
                  >
                    <ArrowUp size={20} />
                  </button>
                )}
              </div>
            </form>
            {!chat.messages.length && (
              <div className="chiron-chat-suggestions" aria-label="Idee per iniziare">
                {suggestions.map(({ icon: Icon, title, detail, prompt }) => (
                  <button
                    key={title}
                    onClick={() => {
                      setDraft(prompt);
                      input.current?.focus({ preventScroll: true });
                    }}
                  >
                    <Icon size={17} strokeWidth={1.7} />
                    <span>
                      {title}
                      <small>{detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="chiron-chat-hint" id={hintId}>
              Risposte di esempio, nessuna AI collegata.
              <span>Invio per inviare · Shift + Invio per andare a capo</span>
            </p>
          </div>
        </div>
        {!chat.messages.length && <div className="chiron-chat-welcome-space" />}
      </div>
      <span className="sr-only" role="status">
        {notice ||
          (chat.generating
            ? 'Preparazione della risposta dimostrativa.'
            : chat.messages.length
              ? 'Risposta dimostrativa pronta.'
              : '')}
      </span>
    </div>
  );
}

// A small, safe subset for the local demo. No raw HTML or external links.
function ChatText({ text }: { text: string }) {
  return text.split('\n\n').map((block, index) => {
    if (block.startsWith('## ')) return <h3 key={index}>{block.slice(3)}</h3>;
    const lines = block.split('\n');
    if (lines.every((line) => line.startsWith('- ')))
      return (
        <ul key={index}>
          {lines.map((line, i) => (
            <li key={i}>
              <InlineText text={line.slice(2)} />
            </li>
          ))}
        </ul>
      );
    if (lines.every((line) => /^\d+\. /.test(line)))
      return (
        <ol key={index}>
          {lines.map((line, i) => (
            <li key={i}>
              <InlineText text={line.replace(/^\d+\. /, '')} />
            </li>
          ))}
        </ol>
      );
    return (
      <p key={index}>
        <InlineText text={block} />
      </p>
    );
  });
}
function InlineText({ text }: { text: string }) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
