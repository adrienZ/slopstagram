import type { ReactNode } from "react";
import {
  MapPinIcon,
  MapPinnedIcon,
  SearchIcon,
  UserSearchIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";
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
import { TaggedPlaceDetails, TaggedPlaceList } from "./tagged-places-details.tsx";
import type { ToolCall } from "../hooks/use-assistant-chat.ts";
import type { MentionablePlace } from "../utils/place-mentions.ts";

type AssistantPart = AssistantUIMessage["parts"][number];

type ToolParts = {
  [Name in AssistantToolName]: Extract<AssistantPart, { type: `tool-${Name}` }>;
};

type OutputOf<Part> = Part extends { state: "output-available"; output: infer Output }
  ? Output
  : never;

export type ToolOutput<Name extends AssistantToolName> = OutputOf<ToolParts[Name]>;

/** How the chat shows a call of one Assistant tool. */
interface AssistantToolView<Name extends AssistantToolName> {
  icon: ReactNode;
  /** What the tool read, behind its trace line. Without it, the trace line does not open. */
  Result?: (props: { output: ToolOutput<Name> }) => ReactNode;
  /** The Tagged places the tool's output names, or null when the tool names none. */
  places: ((output: ToolOutput<Name>) => Array<MentionablePlace>) | null;
}

/** One view for every Assistant tool: a tool without a view does not compile. */
type AssistantToolViews = { [Name in AssistantToolName]: AssistantToolView<Name> };

function placeOf({ id, name }: MentionablePlace): MentionablePlace {
  return { id, name };
}

export const assistantToolViews: AssistantToolViews = {
  getFeedUserSummaries: {
    icon: <UserSearchIcon />,
    Result: ({ output }) => <FeedUserSummariesDetails results={output} />,
    places: null,
  },
  getTaggedPlace: {
    icon: <MapPinIcon />,
    Result: ({ output }) => <TaggedPlaceDetails read={output} />,
    places: (output) => (output.status === "found" ? [placeOf(output.place)] : []),
  },
  listAccounts: {
    icon: <UsersIcon />,
    Result: ({ output }) => <AccountList listed={output.accounts} />,
    places: null,
  },
  listTaggedPlaces: {
    icon: <MapPinnedIcon />,
    Result: ({ output }) => <TaggedPlaceList places={output.places} total={output.total} />,
    places: (output) => output.places.map(placeOf),
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
    places: null,
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
    places: (output) => output.places.map(placeOf),
  },
};

function getToolStatus(state: ToolCall["part"]["state"]): "error" | "running" | undefined {
  if (state === "output-error" || state === "output-denied") {
    return "error";
  }
  return state === "output-available" ? undefined : "running";
}

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

/**
 * A tool call as one trace line, the tool's name and what it was asked, which opens on what the
 * tool read once it has run. An invalid call shows its line only.
 */
export function ToolTrace({ call }: { call: ToolCall }) {
  const view = call.invalid ? undefined : assistantToolViews[call.name];
  const line = (
    <TraceLine status={getToolStatus(call.part.state)}>
      <TraceIcon>{view?.icon ?? <WrenchIcon />}</TraceIcon>
      <TraceTitle>{call.name}</TraceTitle>
      {/* What the Assistant asked the tool. */}
      <TraceDescription className="tw:min-w-0 tw:shrink tw:truncate tw:font-mono tw:text-xs">
        {JSON.stringify(call.part.input ?? {})}
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
