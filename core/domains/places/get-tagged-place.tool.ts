import { tool } from "ai";
import { z } from "zod";
import {
  getTaggedPlace,
  TaggedPlaceReadSchema,
  type TaggedPlacesReadRuntime,
} from "./tagged-places.ts";

const DESCRIPTION = `Reads one Tagged place by its id: its name, category and address (null when unknown), its story count, the date of its latest story, its owners as @username, and its latest 5 stories, each with its date and owner.

Use it when the message asks about one place: who went there, when, or what it is. Take its id as is from the result of listTaggedPlaces or searchTaggedPlaces; when you only have its name, call searchTaggedPlaces first. Never make up an id.
Do not use it to list places. Do not use it for a greeting or a message that is not about places.

Outcomes: "status" is "found" with the place, or "unknown" when no place has this id: say so, and never invent a place. When "hasMoreStories" is true, say that older stories tag the place too. Write the place as a markdown link [name](place:id), with its id as is.`;

/** The Assistant tool reading one Tagged place and its latest stories. Read-only. */
export function createGetTaggedPlaceTool(runtime: TaggedPlacesReadRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          'The place id as a list or a search of places gave it. Example: "instagram:123456".',
        ),
    }),
    outputSchema: TaggedPlaceReadSchema,
    execute: ({ id }) => getTaggedPlace(runtime, id),
  });
}
