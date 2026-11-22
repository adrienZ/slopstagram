import type { ReactNode } from "react";
import {
  AtSignIcon,
  MapPinIcon,
  MapPinnedIcon,
  NetworkIcon,
  SearchIcon,
  UserSearchIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import type { AssistantToolName } from "@@/core/domains/assistant/assistant-tools.ts";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "../shadcn/ui/trace.tsx";
import { AccountList } from "./account-list.tsx";
import { FeedUserSummariesDetails } from "./feed-user-summaries-details.tsx";
import {
  MentionConnectionDetails,
  MentionConnectionSummaries,
  MentionPeople,
} from "./mention-connections-details.tsx";
import { TaggedPlaceDetails, TaggedPlaceList } from "./tagged-places-details.tsx";
import type { ToolCall, ToolOutput } from "../hooks/use-assistant-chat.ts";

interface AssistantToolView<Name extends AssistantToolName> {
  icon: ReactNode;
  Result?: (props: { output: ToolOutput<Name> }) => ReactNode;
}

/** One view for every Assistant tool: a tool without a view does not compile. */
type AssistantToolViews = { [Name in AssistantToolName]: AssistantToolView<Name> };

const assistantToolViews: AssistantToolViews = {
  getFeedUserSummaries: {
    icon: <UserSearchIcon />,
    Result: ({ output }) => <FeedUserSummariesDetails results={output} />,
  },
  getMentionConnection: {
    icon: <AtSignIcon />,
    Result: ({ output }) => <MentionConnectionDetails read={output} />,
  },
  getTaggedPlace: {
    icon: <MapPinIcon />,
    Result: ({ output }) => <TaggedPlaceDetails read={output} />,
  },
  listAccounts: {
    icon: <UsersIcon />,
    Result: ({ output }) => <AccountList listed={output.accounts} />,
  },
  listMentionConnections: {
    icon: <NetworkIcon />,
    Result: ({ output }) => <MentionConnectionSummaries list={output} />,
  },
  listTaggedPlaces: {
    icon: <MapPinnedIcon />,
    Result: ({ output }) => <TaggedPlaceList places={output.places} total={output.total} />,
  },
  searchAccounts: {
    icon: <SearchIcon />,
    Result: ({ output }) => (
      <AccountList
        emptyLabel="Aucun compte trouvé."
        label="Comptes trouvés"
        listed={output.accounts}
      />
    ),
  },
  searchMentionPeople: {
    icon: <SearchIcon />,
    Result: ({ output }) => <MentionPeople page={output} />,
  },
  searchTaggedPlaces: {
    icon: <SearchIcon />,
    Result: ({ output }) => (
      <TaggedPlaceList
        emptyLabel="Aucun lieu trouvé."
        label="Lieux trouvés"
        places={output.places}
        total={output.total}
      />
    ),
  },
};

function getToolStatus(state: ToolCall["part"]["state"]): "error" | "running" | undefined {
  if (state === "output-error" || state === "output-denied") {
    return "error";
  }

  return state === "output-available" ? undefined : "running";
}

/** Generic over the name, so TypeScript pairs a tool's view with that tool's output. */
function ToolResult<Name extends AssistantToolName>({
  name,
  output,
}: {
  name: Name;
  output: ToolOutput<Name>;
}) {
  const { Result } = assistantToolViews[name];

  return Result === undefined ? null : <Result output={output} />;
}

export function ToolTrace({ call }: { call: ToolCall }) {
  const view = call.invalid ? undefined : assistantToolViews[call.name];

  const line = (
    <TraceLine status={getToolStatus(call.part.state)}>
      <TraceIcon>{view?.icon ?? <WrenchIcon />}</TraceIcon>
      <TraceTitle>{call.name}</TraceTitle>
      {/* What the Assistant asked the tool. */}
      <TraceDescription className="tw:min-w-0 tw:shrink">
        <span className="tw:block tw:truncate tw:font-mono tw:text-xs">
          {JSON.stringify(call.part.input ?? {})}
        </span>
      </TraceDescription>
    </TraceLine>
  );

  if (call.invalid || view?.Result === undefined) {
    return line;
  }

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        {call.part.state === "output-available" && (
          <ToolResult name={call.name} output={call.part.output} />
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
