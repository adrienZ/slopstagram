import { useId, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from "react";
import type { SidebarUser } from "@/loaders/sidebar-users.ts";
import { findTypedMention, insertMention, suggestAccounts } from "@/utils/chat-mentions.ts";

/**
 * The saved accounts suggested for the Mention typed before the caret of the message field, as
 * a listbox the field controls: arrows move the active suggestion, Enter or Tab picks it, Escape
 * closes the list. Picking inserts `@username` and a space in the message.
 */
export function useMentionSuggestions({
  accounts,
  draft,
  setDraft,
}: {
  accounts: Array<SidebarUser>;
  draft: string;
  setDraft: (draft: string) => void;
}) {
  const listboxId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // The `@` index of a Mention whose suggestions were closed with Escape.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const mention = findTypedMention(draft, Math.min(caret, draft.length));
  const suggestions =
    mention === null || mention.start === dismissedAt ? [] : suggestAccounts(accounts, mention);
  const open = suggestions.length > 0;
  const active = Math.min(activeIndex, suggestions.length - 1);

  function optionId(index: number) {
    return `${listboxId}-${index}`;
  }

  function pick(username: string) {
    if (mention === null) {
      return;
    }
    const inserted = insertMention(draft, caret, mention, username);
    // Write the text and the caret in the field right away: React keeps the caret when the
    // re-render finds the field already showing the draft.
    const input = field.current;
    if (input !== null) {
      input.value = inserted.text;
      input.focus();
      input.setSelectionRange(inserted.caret, inserted.caret);
    }
    setCaret(inserted.caret);
    setActiveIndex(0);
    setDraft(inserted.text);
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const { selectionStart, value } = event.target;
    if (findTypedMention(value, selectionStart) === null) {
      setDismissedAt(null);
    }
    setCaret(selectionStart);
    setActiveIndex(0);
    setDraft(value);
  }

  /** Handles the key when it acts on the suggestions, and says whether it did. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const suggestion = suggestions.at(active);
    if (!open || suggestion === undefined || event.nativeEvent.isComposing) {
      return false;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((active + step + suggestions.length) % suggestions.length);
    } else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      pick(suggestion.username);
    } else if (event.key === "Escape" && mention !== null) {
      setDismissedAt(mention.start);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  }

  return {
    /** Props of the message field, which owns the focus while suggestions are shown. */
    field: {
      ref: field,
      "aria-autocomplete": "list" as const,
      "aria-controls": open ? listboxId : undefined,
      "aria-activedescendant": open ? optionId(active) : undefined,
      onChange,
      onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => {
        setCaret(event.currentTarget.selectionStart);
      },
    },
    onKeyDown,
    /** The suggestions to show, or `null` when the list is closed. */
    listbox: open
      ? {
          id: listboxId,
          options: suggestions.map((account, index) => ({
            account,
            active: index === active,
            id: optionId(index),
            index,
          })),
        }
      : null,
    pick,
    setActive: setActiveIndex,
  };
}
