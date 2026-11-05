import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";

/** A Tagged place an Assistant answer may name: one its tools read in the same message. */
export interface MentionablePlace {
  id: string;
  name: string;
}

/** The Tagged places the Assistant's tools listed, found or read in a message. */
export function findReadPlaces(message: AssistantUIMessage): Array<MentionablePlace> {
  return message.parts.flatMap((part) => {
    if (part.type === "tool-listTaggedPlaces" || part.type === "tool-searchTaggedPlaces") {
      return part.state === "output-available"
        ? part.output.places.map(({ id, name }) => ({ id, name }))
        : [];
    }
    if (
      part.type === "tool-getTaggedPlace" &&
      part.state === "output-available" &&
      part.output.status === "found"
    ) {
      return [{ id: part.output.place.id, name: part.output.place.name }];
    }
    return [];
  });
}
