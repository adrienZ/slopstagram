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
import type { MentionablePlace } from "../utils/place-mentions.ts";

type AssistantPart = AssistantUIMessage["parts"][number];

/** The tool parts of an Assistant message, by tool name. */
type ToolParts = {
  [Name in AssistantToolName]: Extract<AssistantPart, { type: `tool-${Name}` }>;
};

export type ToolPart = ToolParts[AssistantToolName];

type OutputOf<Part> = Part extends { state: "output-available"; output: infer Output }
  ? Output
  : never;

/** What each Assistant tool returns, by tool name. */
type ToolOutputs = {
  [Name in AssistantToolName]: OutputOf<ToolParts[Name]>;
};

type ToolOutput<Name extends AssistantToolName> = ToolOutputs[Name];

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

/**
 * How the chat shows each Assistant tool. The Assistant writes the answer from what the tool read:
 * the chat traces the call and keeps the result behind it.
 */
const assistantToolViews: AssistantToolViews = {
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

function toolNameOf(part: ToolPart): string {
  return part.type.slice("tool-".length);
}

function isKnownTool(name: string): name is AssistantToolName {
  return Object.hasOwn(assistantToolViews, name);
}

/** Whether a part of an Assistant message is a tool call. */
export function isToolPart(part: AssistantPart): part is ToolPart {
  return part.type.startsWith("tool-");
}

function getToolStatus(state: ToolPart["state"]): "error" | "running" | undefined {
  if (state === "output-error" || state === "output-denied") {
    return "error";
  }
  return state === "output-available" ? undefined : "running";
}

function readResult<Name extends AssistantToolName>(
  name: Name,
  output: ToolOutput<Name>,
): ReactNode {
  const { Result } = assistantToolViews[name];
  return Result === undefined ? undefined : <Result output={output} />;
}

function readPlaces<Name extends AssistantToolName>(
  name: Name,
  output: ToolOutput<Name>,
): Array<MentionablePlace> {
  return assistantToolViews[name].places?.(output) ?? [];
}

/**
 * A tool call as one trace line, the tool's name and what it was asked, which opens on what the
 * tool read once it has run. A tool the page does not know shows its line only.
 */
export function ToolTrace({ part }: { part: ToolPart }) {
  const name = toolNameOf(part);
  const known = isKnownTool(name);
  const line = (
    <TraceLine status={getToolStatus(part.state)}>
      <TraceIcon>{known ? assistantToolViews[name].icon : <WrenchIcon />}</TraceIcon>
      <TraceTitle>{name}</TraceTitle>
      {/* What the Assistant asked the tool. */}
      <TraceDescription className="tw:min-w-0 tw:shrink tw:truncate tw:font-mono tw:text-xs">
        {JSON.stringify(part.input ?? {})}
      </TraceDescription>
    </TraceLine>
  );
  const result =
    known && part.state === "output-available" ? readResult(name, part.output) : undefined;
  const opens = known && assistantToolViews[name].Result !== undefined;
  if (!opens) {
    return line;
  }
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{result}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/** The Tagged places the Assistant's tools listed, found or read in a message. */
export function findReadPlaces(message: AssistantUIMessage): Array<MentionablePlace> {
  return message.parts.flatMap((part) => {
    if (!isToolPart(part) || part.state !== "output-available") {
      return [];
    }
    const name = toolNameOf(part);
    return isKnownTool(name) ? readPlaces(name, part.output) : [];
  });
}
