import { BrainIcon, SendIcon, UserSearchIcon } from "lucide-react";
import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";
import { useAssistantChat } from "../hooks/use-assistant-chat.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle } from "../utils/helper.ts";
import { Bubble, BubbleContent } from "../shadcn/ui/bubble.tsx";
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
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "../shadcn/ui/trace.tsx";
import { ChatMarkdown } from "./chat-markdown.tsx";
import { FeedUserSummaryCard } from "./feed-user-summary-card.tsx";

type AssistantPart = AssistantUIMessage["parts"][number];
type FeedUserSummaryPart = Extract<AssistantPart, { type: "tool-getFeedUserSummary" }>;
type FeedUserSummariesPart = Extract<AssistantPart, { type: "tool-getFeedUserSummaries" }>;

function FeedUserSummaryPartView({
  accounts,
  part,
}: {
  accounts: Array<SidebarUser>;
  part: FeedUserSummaryPart;
}) {
  const username = part.input?.username ?? "";
  if (part.state === "output-available") {
    return <FeedUserSummaryCard accounts={accounts} outcome={part.output} username={username} />;
  }
  const failed = part.state === "output-error" || part.state === "output-denied";
  return (
    <TraceLine status={failed ? "error" : "running"}>
      <TraceIcon>
        <UserSearchIcon />
      </TraceIcon>
      <TraceTitle>
        {failed
          ? `Le résumé de ${formatUserHandle(username)} n’a pas pu être lu.`
          : `Lecture du résumé de ${formatUserHandle(username)}`}
      </TraceTitle>
    </TraceLine>
  );
}

/** The comparison of several accounts is written by the Assistant: the chat only traces the read. */
function FeedUserSummariesPartView({ part }: { part: FeedUserSummariesPart }) {
  const handles = (part.input?.usernames ?? [])
    .map((username) => formatUserHandle(username ?? ""))
    .join(", ");
  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";
  let status: "error" | "running" | undefined;
  if (failed) {
    status = "error";
  } else if (!done) {
    status = "running";
  }
  return (
    <TraceLine status={status}>
      <TraceIcon>
        <UserSearchIcon />
      </TraceIcon>
      <TraceTitle>
        {failed
          ? `Les résumés de ${handles} n’ont pas pu être lus.`
          : `Lecture des résumés de ${handles}`}
      </TraceTitle>
    </TraceLine>
  );
}

function AssistantPartView({
  accounts,
  part,
}: {
  accounts: Array<SidebarUser>;
  part: AssistantPart;
}) {
  if (part.type === "text") {
    return <ChatMarkdown>{part.text}</ChatMarkdown>;
  }
  if (part.type === "reasoning") {
    if (part.state !== "streaming" && part.text.trim() === "") {
      return null;
    }
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={part.state === "streaming" ? "running" : undefined}>
            <TraceIcon>
              <BrainIcon />
            </TraceIcon>
            <TraceTitle>Raisonnement</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="tw:whitespace-pre-wrap">
          {part.text}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }
  if (part.type === "tool-getFeedUserSummary") {
    return <FeedUserSummaryPartView accounts={accounts} part={part} />;
  }
  if (part.type === "tool-getFeedUserSummaries") {
    return <FeedUserSummariesPartView part={part} />;
  }
  return null;
}

function ChatMessage({
  accounts,
  message,
}: {
  accounts: Array<SidebarUser>;
  message: AssistantUIMessage;
}) {
  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble variant="default" align="end">
            <BubbleContent className="tw:whitespace-pre-wrap">
              {message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  return (
    <Message align="start">
      <MessageContent className="tw:grid tw:w-full tw:gap-3">
        {message.parts.map((part, index) => (
          // Parts have no id; their position in a message never changes.
          // oxlint-disable-next-line react/no-array-index-key
          <AssistantPartView key={`${message.id}-${index}`} accounts={accounts} part={part} />
        ))}
      </MessageContent>
    </Message>
  );
}

/** The conversation with the Assistant and the field to write to it. */
export function ChatPanel({ accounts }: { accounts: Array<SidebarUser> }) {
  const chat = useAssistantChat();

  return (
    <div className="tw:mx-auto tw:flex tw:h-[calc(100svh-3.5rem)] tw:w-full tw:max-w-3xl tw:flex-col tw:gap-4 tw:px-4 tw:pt-6 tw:pb-4">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="tw:flex-1" aria-live="polite">
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {chat.messages.length === 0 && (
                <p className="tw:text-sm tw:text-muted-foreground">
                  Mentionne un compte avec @ et demande ce qu’il a publié dans les dernières 24
                  heures.
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
        onSubmit={(event) => {
          event.preventDefault();
          chat.send();
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            aria-label="Message"
            placeholder="Écris un message, @ pour mentionner un compte"
            value={chat.draft}
            onChange={(event) => {
              chat.setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                chat.send();
              }
            }}
          />
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
