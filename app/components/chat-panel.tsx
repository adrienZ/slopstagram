import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { SendIcon } from "lucide-react";
import { z } from "zod";
import type { SyntheticEvent } from "react";
import { useChatComposer } from "../hooks/use-chat-composer.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle } from "../utils/helper.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Bubble, BubbleContent } from "../shadcn/ui/bubble.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "../shadcn/ui/input-group.tsx";
import { Message, MessageContent } from "../shadcn/ui/message.tsx";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "../shadcn/ui/message-scroller.tsx";
import { AccountList, MentionBackdrop, MentionedText } from "./chat-mentions.tsx";

const transport = new DefaultChatTransport({ api: "/api/chat" });

function describeTool(name: string): string {
  if (name === "getRecentUserSummary") {
    return "Résumé des dernières 24 heures";
  }
  return name === "listUsers" ? "Liste des comptes" : name;
}

const AccountsOutputSchema = z.array(z.object({ username: z.string() }));

function MessageParts({ message, users }: { message: UIMessage; users: Array<SidebarUser> }) {
  return message.parts.map((part, index) => {
    const key = `${message.id}-${index}`;
    if (part.type === "text") {
      return message.role === "user" ? (
        <MentionedText key={key} text={part.text} users={users} />
      ) : (
        <p key={key}>{part.text}</p>
      );
    }
    if (part.type === "reasoning") {
      return (
        <details key={key} className="tw:text-xs tw:text-muted-foreground">
          <summary>Raisonnement</summary>
          <p className="tw:whitespace-pre-wrap">{part.text}</p>
        </details>
      );
    }
    if (isToolUIPart(part)) {
      const accounts =
        getToolName(part) === "listUsers" && part.state === "output-available"
          ? AccountsOutputSchema.safeParse(part.output)
          : null;
      return (
        <div key={key} className="tw:grid tw:gap-1">
          <p className="tw:text-xs tw:text-muted-foreground">
            {`Outil : ${describeTool(getToolName(part))}`}
          </p>
          {accounts?.success === true && (
            <AccountList usernames={accounts.data.map(({ username }) => username)} users={users} />
          )}
        </div>
      );
    }
    return null;
  });
}

export function ChatPanel({ users }: { users: Array<SidebarUser> }) {
  const { messages, sendMessage, status, error } = useChat({ transport });
  const composer = useChatComposer(users);
  const busy = status === "submitted" || status === "streaming";

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const text = composer.text.trim();
    if (text.length === 0 || busy) {
      return;
    }
    void sendMessage({ text });
    composer.clear();
  }

  return (
    <div className="tw:mx-auto tw:flex tw:h-[calc(100svh-3.5rem)] tw:w-full tw:max-w-3xl tw:flex-col tw:gap-4 tw:px-4 tw:pt-6 tw:pb-4">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="tw:flex-1" aria-live="polite">
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {messages.length === 0 && (
                <p className="tw:text-sm tw:text-muted-foreground">
                  Demande la liste des comptes, ou mentionne-en un avec @ pour lire son résumé des
                  dernières 24 heures.
                </p>
              )}
              {messages.map((message) => {
                const own = message.role === "user";
                return (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={own}>
                    <Message align={own ? "end" : "start"}>
                      <MessageContent>
                        <Bubble variant={own ? "default" : "muted"} align={own ? "end" : "start"}>
                          <BubbleContent className="tw:grid tw:gap-1">
                            <MessageParts message={message} users={users} />
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
              {status === "submitted" && <p className="tw:text-sm tw:text-muted-foreground">…</p>}
              {error !== undefined && (
                <p role="alert" className="tw:text-sm tw:text-destructive">
                  Le modèle n’a pas répondu.
                </p>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <form onSubmit={onSubmit} className="tw:relative">
        {composer.suggestions.length > 0 && (
          <ul
            aria-label="Suggestions de mentions"
            className="tw:absolute tw:bottom-full tw:mb-2 tw:w-full tw:overflow-hidden tw:rounded-lg tw:border tw:bg-popover tw:p-1 tw:shadow-md"
          >
            {composer.suggestions.map((user) => (
              <li key={user.username}>
                <Button
                  type="button"
                  variant="ghost"
                  className="tw:w-full tw:justify-start"
                  onClick={() => {
                    composer.pickSuggestion(user.username);
                  }}
                >
                  <Avatar aria-hidden>
                    <AvatarImage src={user.avatarPath} alt="" />
                    <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {formatUserHandle(user.username)}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <InputGroup>
          <div className="tw:relative tw:w-full">
            <MentionBackdrop text={composer.text} users={users} />
            <InputGroupTextarea
              ref={composer.textarea}
              aria-label="Message"
              placeholder="Écris un message, @ pour mentionner un compte"
              value={composer.text}
              onChange={composer.onChange}
              onSelect={composer.onSelect}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  onSubmit(event);
                }
              }}
              className="tw:relative tw:text-transparent tw:caret-foreground"
            />
          </div>
          <InputGroupAddon align="block-end">
            <InputGroupButton
              type="submit"
              variant="default"
              disabled={busy}
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
