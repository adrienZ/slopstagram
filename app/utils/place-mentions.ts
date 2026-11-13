import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";
import type { AssistantToolName } from "@@/core/domains/assistant/assistant-tools.ts";
import { toolCallOf, type ToolOutput } from "../hooks/use-assistant-chat.ts";

/** A Tagged place an Assistant answer may name: one its tools read in the same message. */
export interface MentionablePlace {
  id: string;
  name: string;
}

/**
 * For every Assistant tool, the Tagged places its output names, or null when it names none: a tool
 * without a decision does not compile.
 */
type PlacesNamedByTool = {
  [Name in AssistantToolName]: ((output: ToolOutput<Name>) => Array<MentionablePlace>) | null;
};

function placeOf({ id, name }: MentionablePlace): MentionablePlace {
  return { id, name };
}

const placesNamedByTool: PlacesNamedByTool = {
  getFeedUserSummaries: null,
  getTaggedPlace: (output) => (output.status === "found" ? [placeOf(output.place)] : []),
  listAccounts: null,
  listTaggedPlaces: (output) => output.places.map(placeOf),
  searchAccounts: null,
  searchTaggedPlaces: (output) => output.places.map(placeOf),
};

/** Generic over the name, so TypeScript pairs a tool's extractor with that tool's output. */
function placesNamedBy<Name extends AssistantToolName>(
  name: Name,
  output: ToolOutput<Name>,
): Array<MentionablePlace> {
  return placesNamedByTool[name]?.(output) ?? [];
}

/** The Tagged places the Assistant's tools listed, found or read in a message. */
export function findReadPlaces(message: AssistantUIMessage): Array<MentionablePlace> {
  return message.parts.flatMap((part) => {
    const call = toolCallOf(part);
    if (call === undefined || call.invalid || call.part.state !== "output-available") {
      return [];
    }
    return placesNamedBy(call.name, call.part.output);
  });
}
