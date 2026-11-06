import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";
import type { SidebarUser } from "../../loaders/sidebar-users.ts";
import { findReadPlaces } from "../../utils/place-mentions.ts";
import { Bubble, BubbleContent } from "../../shadcn/ui/bubble.tsx";
import { Message, MessageContent } from "../../shadcn/ui/message.tsx";
import { AssistantPartView } from "./assistant-part-view.tsx";
import { MentionedText } from "./chat-mentions.tsx";

/** One message of the conversation: the user's bubble, or the parts of the Assistant's answer. */
export function ChatMessage({
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
            <BubbleContent asChild className="tw:whitespace-pre-wrap">
              <p>
                <MentionedText
                  accounts={accounts}
                  text={message.parts
                    .map((part) => (part.type === "text" ? part.text : ""))
                    .join("")}
                />
              </p>
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  const places = findReadPlaces(message);
  return (
    <Message align="start">
      <MessageContent className="tw:grid tw:w-full tw:gap-3">
        {message.parts.map((part, index) => (
          // Parts have no id; their position in a message never changes.
          // oxlint-disable-next-line react/no-array-index-key
          <AssistantPartView
            key={`${message.id}-${index}`}
            accounts={accounts}
            part={part}
            places={places}
          />
        ))}
      </MessageContent>
    </Message>
  );
}
