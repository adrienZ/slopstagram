import { tool } from "ai";
import { z } from "zod";
import {
  PlaceOffsetSchema,
  searchTaggedPlaces,
  TaggedPlacePageSchema,
  type TaggedPlacesReadRuntime,
} from "@@/core/domains/places/tagged-places.ts";

const DESCRIPTION = `Searches the Tagged places whose name, address or category contains the query, ignoring case and accents, the closest first. Each place has its id (copy it as is), its name, its category (null when unknown), its story count, the date of its latest story and its owners, as @username.

Use it when the message names a place, or part of its name, address or category, to find it: "did anyone go to the Louvre?" or "which cafes?". Then read the place's details with getTaggedPlace, using the id you found.
Do not use it to list every place or the places of an account: use listTaggedPlaces. Do not use it for a greeting or a message that is not about places.

Outcomes: "places" holds up to 10 matches, "total" counts every match and "nextOffset" is the offset of the next page, null on the last one: say so when there are more. When "places" is empty, say that no place matches, and never invent a place. When several places match, name them and ask which one is meant. Write each place as a markdown link [name](place:id), with its id as is.`;

/** The Assistant tool searching the Tagged places by name, address or category. Read-only. */
export function createSearchTaggedPlacesTool(runtime: TaggedPlacesReadRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The name, address or category, or part of it, to look for. Example: "louvre" for "did anyone go to the Louvre?".',
        ),
      offset: PlaceOffsetSchema,
    }),
    outputSchema: TaggedPlacePageSchema,
    execute: (input) => searchTaggedPlaces(runtime, input),
  });
}
