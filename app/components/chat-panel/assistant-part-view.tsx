import { BrainIcon } from "lucide-react";
import type { SidebarUser } from "../../loaders/sidebar-users.ts";
import type { MentionablePlace } from "../../utils/place-mentions.ts";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "../../shadcn/ui/trace.tsx";
import { ChatMarkdown } from "./chat-markdown.tsx";
import {
  FeedUserSummariesPartView,
  GetTaggedPlacePartView,
  ListAccountsPartView,
  ListTaggedPlacesPartView,
  SearchAccountsPartView,
  SearchTaggedPlacesPartView,
} from "./tool-part-views.tsx";
import type { AssistantPart } from "./tool-trace.tsx";

/** One part of an Assistant message: its text, its reasoning or the trace of a tool it called. */
export function AssistantPartView({
  accounts,
  part,
  places,
}: {
  accounts: Array<SidebarUser>;
  part: AssistantPart;
  places: Array<MentionablePlace>;
}) {
  if (part.type === "text") {
    return (
      <ChatMarkdown accounts={accounts} places={places}>
        {part.text}
      </ChatMarkdown>
    );
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
  if (part.type === "tool-getFeedUserSummaries") {
    return <FeedUserSummariesPartView part={part} />;
  }
  if (part.type === "tool-listAccounts") {
    return <ListAccountsPartView part={part} />;
  }
  if (part.type === "tool-searchAccounts") {
    return <SearchAccountsPartView part={part} />;
  }
  if (part.type === "tool-listTaggedPlaces") {
    return <ListTaggedPlacesPartView part={part} />;
  }
  if (part.type === "tool-searchTaggedPlaces") {
    return <SearchTaggedPlacesPartView part={part} />;
  }
  if (part.type === "tool-getTaggedPlace") {
    return <GetTaggedPlacePartView part={part} />;
  }
  return null;
}
