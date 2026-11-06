import { SendIcon } from "lucide-react";
import { useAssistantChat } from "../../hooks/use-assistant-chat.ts";
import { useMentionSuggestions } from "../../hooks/use-mention-suggestions.ts";
import type { SidebarUser } from "../../loaders/sidebar-users.ts";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "../../shadcn/ui/input-group.tsx";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "../../shadcn/ui/message-scroller.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { MentionBackdrop, MentionSuggestionList } from "./chat-mentions.tsx";

/** The conversation with the Assistant and the field to write to it. */
export function ChatPanel({ accounts }: { accounts: Array<SidebarUser> }) {
  const chat = useAssistantChat();
  const mentions = useMentionSuggestions({
    accounts,
    draft: chat.draft,
    setDraft: chat.setDraft,
  });

  return (
    <div className="tw:mx-auto tw:flex tw:h-[calc(100svh-3.5rem)] tw:w-full tw:max-w-3xl tw:flex-col tw:gap-4 tw:px-4 tw:pt-6 tw:pb-4">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="tw:flex-1" aria-live="polite">
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {chat.messages.length === 0 && (
                <p className="tw:text-sm tw:text-muted-foreground">
                  Mentionne un compte avec @ et demande ce qu’il a publié dans les dernières 24
                  heures, ou demande quels comptes tu connais.
                </p>
              )}
              {chat.messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <ChatMessage accounts={accounts} message={message} />
                </MessageScrollerItem>
              ))}
              {chat.waiting && (
                <MessageScrollerItem messageId="waiting">
                  <p className="tw:text-sm tw:text-muted-foreground tw:shimmer">
                    L’Assistant réfléchit…
                  </p>
                </MessageScrollerItem>
              )}
              {chat.failed && (
                <MessageScrollerItem messageId="error">
                  <p role="alert" className="tw:text-sm tw:text-destructive">
                    Le modèle n’a pas répondu. Vérifie que le serveur Ollama tourne, puis réessaie.
                  </p>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <form
        className="tw:relative"
        onSubmit={(event) => {
          event.preventDefault();
          chat.send();
        }}
      >
        {mentions.listbox !== null && (
          <MentionSuggestionList
            id={mentions.listbox.id}
            options={mentions.listbox.options}
            onHover={mentions.setActive}
            onPick={mentions.pick}
          />
        )}
        <InputGroup>
          <div className="tw:relative tw:w-full">
            <MentionBackdrop accounts={accounts} text={chat.draft} />
            <InputGroupTextarea
              {...mentions.field}
              aria-label="Message"
              placeholder="Écris un message, @ pour mentionner un compte"
              value={chat.draft}
              className="tw:relative tw:text-transparent tw:caret-foreground"
              onKeyDown={(event) => {
                if (mentions.onKeyDown(event)) {
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  chat.send();
                }
              }}
            />
          </div>
          <InputGroupAddon align="block-end">
            <InputGroupButton
              type="submit"
              variant="default"
              disabled={chat.answering}
              className="tw:ml-auto"
            >
              <SendIcon />
              Envoyer
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
