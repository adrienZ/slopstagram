import { useState } from "react";
import type { ChatThread } from "./chat-demo.ts";
import { ChatIcon } from "./chat-icon.tsx";

interface ChatSidebarProps {
  open: boolean;
  mobileOpen: boolean;
  threads: Array<ChatThread>;
  activeId: string | null;
  onClose: () => void;
  onNew: () => void;
  onSelect: (thread: ChatThread) => void;
}

export function ChatSidebar({
  open,
  mobileOpen,
  threads,
  activeId,
  onClose,
  onNew,
  onSelect,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const filtered = threads.filter((thread) =>
    thread.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="chat-backdrop"
          onClick={onClose}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`chat-sidebar ${open ? "is-open" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
        aria-label="Chat navigation"
        inert={!open}
        id="chat-sidebar"
      >
        <div className="chat-brand-row">
          <a href="/chat" className="chat-brand">
            <span className="chat-brand-mark">
              <ChatIcon name="spark" size={18} />
            </span>
            slopstagram<span className="chat-brand-dot">.</span>
          </a>
          <button
            type="button"
            className="chat-icon-button"
            onClick={onClose}
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <ChatIcon name="panel" size={18} />
          </button>
        </div>
        <button type="button" className="chat-new-button" onClick={onNew}>
          <ChatIcon name="edit" size={17} />
          New chat<span>＋</span>
        </button>
        <button
          type="button"
          className="chat-search-button"
          onClick={() => {
            setSearching(!searching);
            if (searching) {
              setSearch("");
            }
          }}
          aria-expanded={searching}
        >
          <ChatIcon name="search" size={17} />
          Search conversations
        </button>
        {searching && (
          <input
            className="chat-history-search"
            aria-label="Search conversations"
            placeholder="Find a conversation…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        )}
        <div className="chat-history">
          <p className="chat-section-label">YOUR CONVERSATIONS</p>
          <nav aria-label="Conversations">
            {filtered.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={`chat-history-item ${thread.id === activeId ? "is-active" : ""}`}
                aria-current={thread.id === activeId ? "page" : undefined}
                onClick={() => {
                  onSelect(thread);
                }}
              >
                <ChatIcon name="message" size={16} />
                <span>{thread.title}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="chat-search-empty">No conversations found.</p>}
          </nav>
        </div>
        <div className="chat-sidebar-bottom">
          <a className="chat-report-link" href="/report">
            <ChatIcon name="globe" size={17} />
            <span>Explore your stories</span>
            <span aria-hidden="true">↗</span>
          </a>
          <div className="chat-workspace-user">
            <span className="chat-avatar">S</span>
            <div>
              <strong>Personal workspace</strong>
              <span>A little room for your ideas</span>
            </div>
            <span className="chat-workspace-status" title="UI demo" />
          </div>
        </div>
      </aside>
    </>
  );
}
