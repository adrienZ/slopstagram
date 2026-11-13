import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";
import type { AssistantToolName } from "@@/core/domains/assistant/assistant-tools.ts";
import { assistantToolViews, type ToolOutput } from "../components/assistant-tool-views.tsx";
import { toolCallOf } from "../hooks/use-assistant-chat.ts";

/** A Tagged place an Assistant answer may name: one its tools read in the same message. */
export interface MentionablePlace {
  id: string;
  name: string;
}

function placesNamedBy<Name extends AssistantToolName>(
  name: Name,
  output: ToolOutput<Name>,
): Array<MentionablePlace> {
  return assistantToolViews[name].places?.(output) ?? [];
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
