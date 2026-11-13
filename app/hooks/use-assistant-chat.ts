import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getStaticToolName,
  isDynamicToolUIPart,
  isStaticToolUIPart,
  type DynamicToolUIPart,
} from "ai";
import { useState } from "react";
import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";
import type { AssistantToolName } from "@@/core/domains/assistant/assistant-tools.ts";

const transport = new DefaultChatTransport<AssistantUIMessage>({ api: "/api/chat" });

type AssistantPart = AssistantUIMessage["parts"][number];

/**
 * A tool call of an Assistant message. An invalid call is one the Assistant could not run: the
 * model invented the tool, or gave it an input its schema refuses.
 */
export type ToolCall =
  | {
      invalid: false;
      name: AssistantToolName;
      part: Exclude<Extract<AssistantPart, { toolCallId: string }>, DynamicToolUIPart>;
    }
  | { invalid: true; name: string; part: DynamicToolUIPart };

export function toolCallOf(part: AssistantPart): ToolCall | undefined {
  if (isStaticToolUIPart(part)) {
    return { invalid: false, name: getStaticToolName(part), part };
  }
  if (isDynamicToolUIPart(part)) {
    return { invalid: true, name: part.toolName, part };
  }
  return undefined;
}

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
