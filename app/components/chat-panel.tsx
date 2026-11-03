import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import type { UIMessage } from "@tanstack/ai-react";
import { SendIcon } from "lucide-react";
import { z } from "zod";
import type { SyntheticEvent } from "react";
import { useChatComposer } from "../hooks/use-chat-composer.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle } from "../utils/helper.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Bubble, BubbleContent } from "../shadcn/ui/bubble.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import { Message, MessageContent, MessageGroup } from "../shadcn/ui/message.tsx";
import { Textarea } from "../shadcn/ui/textarea.tsx";
import { AccountList, MentionBackdrop, MentionedText } from "./chat-mentions.tsx";

const connection = fetchServerSentEvents("/api/chat");

function describeTool(name: string): string {
  if (name === "getRecentUserSummary") {
    return "Résumé des dernières 24 heures";
  }
  return name === "listUsers" ? "Liste des comptes" : name;
}

const ListedAccountsSchema = z.array(z.object({ username: z.string() }));

/** The accounts the `listUsers` call returned, read from the tool result that answers it. */
function readListedAccounts(message: UIMessage, callId: string): Array<string> {
  const result = message.parts.find(
    (part) => part.type === "tool-result" && part.toolCallId === callId,
  );
  const content = z.string().safeParse(result?.type === "tool-result" ? result.content : null);
  if (!content.success) {
    return [];
  }
  try {
    const accounts = ListedAccountsSchema.safeParse(JSON.parse(content.data));
    return accounts.success ? accounts.data.map(({ username }) => username) : [];
  } catch {
    return [];
  }
}

function MessageParts({ message, users }: { message: UIMessage; users: Array<SidebarUser> }) {
  return message.parts.map((part, index) => {
    const key = `${message.id}-${index}`;
    if (part.type === "text") {
      return message.role === "user" ? (
        <MentionedText key={key} text={part.content} users={users} />
      ) : (
        <p key={key}>{part.content}</p>
      );
    }
    if (part.type === "thinking") {
      return (
        <details key={key} className="tw:text-xs tw:text-muted-foreground">
          <summary>Raisonnement</summary>
          <p className="tw:whitespace-pre-wrap">{part.content}</p>
        </details>
      );
    }
    if (part.type === "tool-call") {
      const usernames = part.name === "listUsers" ? readListedAccounts(message, part.id) : [];
      return (
        <div key={key} className="tw:grid tw:gap-1">
          <p className="tw:text-xs tw:text-muted-foreground">
            {`Outil : ${describeTool(part.name)}`}
          </p>
          {usernames.length > 0 && <AccountList usernames={usernames} users={users} />}
        </div>
      );
    }
    return null;
  });
}

export function ChatPanel({ users }: { users: Array<SidebarUser> }) {
  const { messages, sendMessage, isLoading, error } = useChat({
    connection,
    threadId: "assistant",
  });
  const composer = useChatComposer(users);
  const busy = isLoading;

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const text = composer.text.trim();
    if (text.length === 0 || busy) {
      return;
    }
    void sendMessage(text);
    composer.clear();
  }

  return (
    <div className="tw:mx-auto tw:flex tw:min-h-[calc(100svh-3.5rem)] tw:w-full tw:max-w-3xl tw:flex-col tw:gap-4 tw:px-4 tw:py-6">
      <MessageGroup className="tw:flex-1 tw:gap-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="tw:text-sm tw:text-muted-foreground">
            Demande la liste des comptes, ou mentionne-en un avec @ pour lire son résumé des
            dernières 24 heures.
          </p>
        )}
        {messages.map((message) => {
          const own = message.role === "user";
          return (
            <Message key={message.id} align={own ? "end" : "start"}>
              <MessageContent>
                <Bubble variant={own ? "default" : "muted"} align={own ? "end" : "start"}>
                  <BubbleContent className="tw:grid tw:gap-1">
                    <MessageParts message={message} users={users} />
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          );
        })}
        {isLoading && messages.at(-1)?.role === "user" && (
          <p className="tw:text-sm tw:text-muted-foreground">…</p>
        )}
        {error !== undefined && (
          <p role="alert" className="tw:text-sm tw:text-destructive">
            Le modèle n’a pas répondu.
          </p>
        )}
      </MessageGroup>
      <form onSubmit={onSubmit} className="tw:relative tw:grid tw:gap-2">
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
        <div className="tw:relative tw:rounded-lg tw:dark:bg-input/30">
          <MentionBackdrop text={composer.text} users={users} />
          <Textarea
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
            className="tw:relative tw:text-transparent tw:caret-foreground tw:dark:bg-transparent"
          />
        </div>
        <Button type="submit" disabled={busy} className="tw:justify-self-end">
          <SendIcon />
          Envoyer
        </Button>
      </form>
    </div>
  );
}
