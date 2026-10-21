import { useState } from "react";
import type { ChatMessage } from "./chat-demo.ts";
import { ChatIcon } from "./chat-icon.tsx";

export function ChatMessages({
  messages,
  generating,
  onRetry,
}: {
  messages: Array<ChatMessage>;
  generating: boolean;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyMessage(message: ChatMessage) {
    try {
      await globalThis.navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setCopyError(null);
    } catch {
      setCopyError(message.id);
    }
  }

  return (
    <div
      className="chat-messages"
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      aria-busy={generating}
    >
      {messages.map((message, index) => (
        <article
          key={message.id}
          className={`chat-message chat-message--${message.role}`}
          aria-label={message.role === "user" ? "Your message" : "Assistant preview response"}
        >
          {message.role === "assistant" && (
            <div className="chat-assistant-label">
              <span className="chat-mini-mark">
                <ChatIcon name="spark" size={16} />
              </span>
              <strong>Slop assistant</strong>
              <span>PREVIEW</span>
            </div>
          )}
          {message.content && <div className="chat-message-body">{message.content}</div>}
          {message.attachments?.map((name) => (
            <span className="chat-message-file" key={name}>
              <ChatIcon name="attach" size={14} />
              {name}
            </span>
          ))}
          {message.role === "assistant" && message.content && !generating && (
            <div className="chat-message-actions">
              <button
                type="button"
                className="chat-icon-button"
                onClick={() => {
                  void copyMessage(message);
                }}
                aria-label={copied === message.id ? "Response copied" : "Copy response"}
                title={copied === message.id ? "Copied" : "Copy response"}
              >
                <ChatIcon name={copied === message.id ? "check" : "copy"} size={16} />
              </button>
              {index === messages.length - 1 && (
                <button
                  type="button"
                  className="chat-icon-button"
                  onClick={onRetry}
                  aria-label="Regenerate demo response"
                  title="Regenerate demo response"
                >
                  <ChatIcon name="refresh" size={16} />
                </button>
              )}
              {copyError === message.id && (
                <span role="status">Couldn’t copy. Select the text to copy it.</span>
              )}
            </div>
          )}
        </article>
      ))}
      {generating && (
        <div className="chat-typing" role="status">
          <span />
          <span />
          <span />
          <span className="chat-sr-only">Writing a demo response…</span>
        </div>
      )}
      <div
        ref={(node) => {
          const viewport = node?.closest(".chat-content");
          viewport?.scrollTo({ top: viewport.scrollHeight });
        }}
      />
    </div>
  );
}
