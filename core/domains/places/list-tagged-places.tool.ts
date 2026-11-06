import { tool } from "ai";
import { z } from "zod";
import {
  listTaggedPlaces,
  PlaceOffsetSchema,
  TaggedPlacePageSchema,
  type TaggedPlaceList,
  type TaggedPlacesRuntime,
} from "@@/core/domains/places/tagged-places.ts";

const OutputSchema = TaggedPlacePageSchema.extend({
  unknownUsernames: z.array(z.string()),
}) satisfies z.ZodType<TaggedPlaceList>;

const DESCRIPTION = `Lists the Tagged places: the places that the accounts tagged on their stories, over all time, the place of the latest story first. Each place has its id (copy it as is), its name, its category (null when unknown), its story count, the date of its latest story and its owners: the accounts that tagged it, as @username.

Use it when the message asks which places were tagged or visited, where the accounts have been, or the places of one or more accounts. Examples: "which places were tagged?", "where did @alice go?".
Do not use it to find a place by its name, address or category: use searchTaggedPlaces. Do not use it for a greeting or a message that is not about places.

Outcomes: "places" holds up to 10 places, "total" counts every place and "nextOffset" is the offset of the next page, null on the last one: when there are more, say so and offer the next ones. "unknownUsernames" lists the requested usernames that are no account: say so. When "places" is empty, say that no place was tagged, and never invent a place. Write each place as a markdown link [name](place:id), with its id as is.`;

/** The Assistant tool listing the Tagged places, of some accounts or all. Read-only. */
export function createListTaggedPlacesTool(runtime: TaggedPlacesRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      usernames: z
        .array(z.string())
        .optional()
        .describe(
          'Only the places of these accounts, without "@". Example: ["alice"] for "where did @alice go?". Leave it out for every account.',
        ),
      offset: PlaceOffsetSchema,
    }),
    outputSchema: OutputSchema,
    execute: (input) => listTaggedPlaces(runtime, input),
  });
}
