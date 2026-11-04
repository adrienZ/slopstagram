import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";

const transport = new DefaultChatTransport<AssistantUIMessage>({ api: "/api/chat" });

/** The conversation with the Assistant, and the message being typed. */
export function useAssistantChat() {
  const { messages, sendMessage, status, error } = useChat<AssistantUIMessage>({ transport });
  const [draft, setDraft] = useState("");
  const answering = status === "submitted" || status === "streaming";

  function send() {
    const text = draft.trim();
    if (text.length === 0 || answering) {
      return;
    }
    void sendMessage({ text });
    setDraft("");
  }

  return {
    answering,
    draft,
    failed: error !== undefined,
    messages,
    send,
    setDraft,
    waiting: status === "submitted",
  };
}
