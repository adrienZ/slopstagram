import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { completeMention, findActiveMention, suggestMentions } from "../utils/chat-mentions.ts";

/** The message being typed and the `@` mention suggestions that follow its caret. */
export function useChatComposer(users: Array<SidebarUser>) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mention = findActiveMention(text, caret);

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setCaret(event.target.selectionStart);
  }

  function pickSuggestion(username: string) {
    if (mention === null) {
      return;
    }
    const completed = completeMention(text, caret, mention, username);
    setText(completed.text);
    setCaret(completed.caret);
    textarea.current?.focus();
  }

  return {
    clear: () => {
      setText("");
      setCaret(0);
    },
    onChange,
    onSelect: (event: { currentTarget: HTMLTextAreaElement }) => {
      setCaret(event.currentTarget.selectionStart);
    },
    pickSuggestion,
    suggestions: suggestMentions(users, mention),
    text,
    textarea,
  };
}
