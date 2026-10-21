import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { createDemoReply, initialThreads, suggestions } from "./chat-demo.ts";
import type { ChatMessage, ChatThread, ResponseStyle } from "./chat-demo.ts";
import { ChatIcon } from "./chat-icon.tsx";
import { ChatMessages } from "./chat-messages.tsx";
import { ChatSidebar } from "./chat-sidebar.tsx";

function subscribeToMobile(listener: () => void) {
  const query = globalThis.matchMedia("(max-width: 760px)");
  query.addEventListener("change", listener);
  return () => {
    query.removeEventListener("change", listener);
  };
}

function getMobileSnapshot() {
  return globalThis.matchMedia("(max-width: 760px)").matches;
}

function getServerMobileSnapshot() {
  return false;
}

export function ChatWorkspace() {
  const [threads, setThreads] = useState(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Array<string>>([]);
  const [style, setStyle] = useState<ResponseStyle>("balanced");
  const [sidebarState, setSidebarState] = useState("default");
  const isMobile = useSyncExternalStore(
    subscribeToMobile,
    getMobileSnapshot,
    getServerMobileSnapshot,
  );
  const sidebarOpen = isMobile ? sidebarState === "open" : sidebarState !== "closed";
  const mobileSidebarOpen = isMobile && sidebarOpen;
  const [generating, setGenerating] = useState(false);
  const timer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeThread = threads.find((thread) => thread.id === activeId);
  const messages = activeThread?.messages ?? [];
  const empty = messages.length === 0;
  const cleanupRef = useCallback(
    () => () => {
      if (timer.current !== null) {
        globalThis.clearTimeout(timer.current);
      }
    },
    [],
  );

  function stopGeneration() {
    if (timer.current !== null) {
      globalThis.clearTimeout(timer.current);
    }
    timer.current = null;
    setGenerating(false);
    setThreads((current) =>
      current.map((thread) => ({
        ...thread,
        messages: thread.messages.map((message) =>
          message.role === "assistant" && message.content === ""
            ? { ...message, content: "Response stopped." }
            : message,
        ),
      })),
    );
  }

  function closeMobileSidebar() {
    if (isMobile) {
      setSidebarState("closed");
    }
  }

  function newChat() {
    stopGeneration();
    setActiveId(null);
    setDraft("");
    setAttachments([]);
    closeMobileSidebar();
    composer.current?.focus();
  }

  function selectThread(thread: ChatThread) {
    stopGeneration();
    setActiveId(thread.id);
    setDraft("");
    setAttachments([]);
    closeMobileSidebar();
  }

  function generate(threadId: string, prompt: string, files: Array<string>) {
    const response = createDemoReply(prompt, style, files);
    const responseId = globalThis.crypto.randomUUID();
    const words = response.split(" ");
    let count = 0;
    setGenerating(true);
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              messages: [...thread.messages, { id: responseId, role: "assistant", content: "" }],
            }
          : thread,
      ),
    );
    function tick() {
      count = Math.min(count + 4, words.length);
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                messages: thread.messages.map((message) =>
                  message.id === responseId
                    ? { ...message, content: words.slice(0, count).join(" ") }
                    : message,
                ),
              }
            : thread,
        ),
      );
      if (count < words.length) {
        timer.current = globalThis.setTimeout(tick, 45);
      } else {
        timer.current = null;
        setGenerating(false);
      }
    }
    timer.current = globalThis.setTimeout(tick, 400);
  }

  function submit() {
    if (generating || (!draft.trim() && attachments.length === 0)) {
      return;
    }
    const text = draft.trim();
    const userMessage: ChatMessage = {
      id: globalThis.crypto.randomUUID(),
      role: "user",
      content: text,
      attachments,
    };
    const threadId = activeId ?? globalThis.crypto.randomUUID();
    if (activeId === null) {
      const thread = {
        id: threadId,
        title: text.slice(0, 48) || attachments[0],
        messages: [userMessage],
      };
      setThreads((current) => [thread, ...current]);
      setActiveId(threadId);
    } else {
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? { ...thread, messages: [...thread.messages, userMessage] }
            : thread,
        ),
      );
    }
    generate(threadId, text, attachments);
    setDraft("");
    setAttachments([]);
    closeMobileSidebar();
    composer.current?.focus();
  }

  function retry() {
    const lastUser = messages.findLast((message) => message.role === "user");
    if (activeId === null || lastUser === undefined || generating) {
      return;
    }
    setThreads((current) =>
      current.map((thread) =>
        thread.id === activeId
          ? {
              ...thread,
              messages: thread.messages.slice(
                0,
                thread.messages.findLastIndex((message) => message.role === "user") + 1,
              ),
            }
          : thread,
      ),
    );
    generate(activeId, lastUser.content, lastUser.attachments ?? []);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function attachFiles(event: ChangeEvent<HTMLInputElement>) {
    const names = Array.from(event.target.files ?? [], (file) => file.name);
    setAttachments((current) => [...new Set([...current, ...names])]);
    event.target.value = "";
  }

  return (
    <div className={`chat-app ${sidebarOpen ? "has-sidebar" : ""}`} ref={cleanupRef} lang="en">
      <a className="chat-skip-link" href="#chat-prompt">
        Skip to message
      </a>
      <ChatSidebar
        open={sidebarOpen}
        mobileOpen={mobileSidebarOpen}
        threads={threads}
        activeId={activeId}
        onClose={() => {
          setSidebarState("closed");
        }}
        onNew={newChat}
        onSelect={selectThread}
      />
      <div className="chat-main" inert={mobileSidebarOpen}>
        <header className="chat-topbar">
          <div className="chat-topbar-left">
            <button
              type="button"
              className="chat-icon-button chat-sidebar-toggle"
              onClick={() => {
                setSidebarState(sidebarOpen ? "closed" : "open");
              }}
              aria-label="Toggle sidebar"
              aria-expanded={sidebarOpen}
              aria-controls="chat-sidebar"
            >
              <ChatIcon name="panel" />
            </button>
            <span className="chat-page-label">Your creative companion</span>
          </div>
          <span className="chat-demo-badge">
            <span />
            UI preview
          </span>
        </header>
        <main className={`chat-content ${empty ? "chat-content--empty" : ""}`} id="chat-main">
          {empty ? (
            <div className="chat-welcome">
              <div className="chat-hero-mark">
                <ChatIcon name="spark" size={33} />
              </div>
              <p className="chat-eyebrow">A SPACE FOR YOUR NEXT IDEA</p>
              <h1>
                A little curiosity.
                <br />
                <span>A lot of possibility.</span>
              </h1>
              <p className="chat-welcome-description">
                Think out loud. Find a fresh angle. Make something you.
              </p>
              <div className="chat-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    className="chat-suggestion"
                    key={suggestion.title}
                    onClick={() => {
                      setDraft(suggestion.prompt);
                      composer.current?.focus();
                    }}
                  >
                    <ChatIcon name={suggestion.icon} size={19} />
                    <strong>{suggestion.title}</strong>
                    <span>{suggestion.description}</span>
                    <span className="chat-suggestion-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ChatMessages messages={messages} generating={generating} onRetry={retry} />
          )}
        </main>
        <div className="chat-composer-area">
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {attachments.length > 0 && (
              <div className="chat-attachments">
                {attachments.map((name) => (
                  <span key={name} className="chat-attachment">
                    <ChatIcon name="attach" size={14} />
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachments((current) => current.filter((file) => file !== name));
                      }}
                      aria-label={`Remove ${name}`}
                    >
                      <ChatIcon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <label htmlFor="chat-prompt" className="chat-sr-only">
              Message Slop assistant
            </label>
            <textarea
              ref={composer}
              id="chat-prompt"
              placeholder="What’s on your mind?"
              rows={2}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={handleKeyDown}
            />
            <div className="chat-composer-toolbar">
              <div className="chat-composer-options">
                <input ref={fileInput} type="file" multiple hidden onChange={attachFiles} />
                <button
                  type="button"
                  className="chat-icon-button"
                  onClick={() => {
                    fileInput.current?.click();
                  }}
                  aria-label="Attach files (local preview only)"
                  title="Attach files · local preview only"
                >
                  <ChatIcon name="attach" size={19} />
                </button>
                <span className="chat-toolbar-divider" />
                <label className="chat-style-select">
                  <ChatIcon name="spark" size={14} />
                  <span className="chat-sr-only">Response style</span>
                  <select
                    value={style}
                    onChange={(event) => {
                      const { value } = event.target;
                      if (value === "balanced" || value === "concise" || value === "creative") {
                        setStyle(value);
                      }
                    }}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="concise">Concise</option>
                    <option value="creative">Creative</option>
                  </select>
                  <ChatIcon name="chevron" size={13} />
                </label>
              </div>
              <div className="chat-send-area">
                <span className="chat-keyboard-hint">
                  {generating ? "Finding the words…" : "↵ to send"}
                </span>
                {generating ? (
                  <button
                    type="button"
                    className="chat-send-button"
                    onClick={stopGeneration}
                    aria-label="Stop response"
                    title="Stop response"
                  >
                    <ChatIcon name="stop" size={18} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="chat-send-button"
                    disabled={!draft.trim() && attachments.length === 0}
                    aria-label="Send message"
                  >
                    <ChatIcon name="arrow" size={20} />
                  </button>
                )}
              </div>
            </div>
          </form>
          <p className="chat-composer-note">
            A little imagination goes a long way.<span>Demo replies · Chats reset on refresh</span>
          </p>
        </div>
        <footer className="chat-bottom-note">
          <span className="chat-bottom-dot" />
          Made for a more thoughtful scroll.
        </footer>
      </div>
    </div>
  );
}
