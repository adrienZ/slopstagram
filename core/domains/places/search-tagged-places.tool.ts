import { defineAssistantTool } from "@@/core/utils/assistant-tool.ts";
import { z } from "zod";
import { PageOffsetSchema } from "@@/core/utils/paging.ts";
import {
  searchTaggedPlaces,
  TaggedPlacePageSchema,
  type TaggedPlacesReadRuntime,
} from "./tagged-places.ts";

const DESCRIPTION = `Searches the Tagged places whose name, address or category contains the query, ignoring case and accents, the closest first. Each place has its id (copy it as is), its name, its category (null when unknown), its story count, the date of its latest story and its owners, as @username.

Use it when the message names a place, or part of its name, address or category: "did anyone go to the Louvre?" or "which cafes?". Then read the place's details with getTaggedPlace, using the id you found.
Do not use it to list every place or the places of an account: use listTaggedPlaces.

Outcomes: "places" holds up to 10 matches, "total" counts every match and "nextOffset" is the offset of the next page, null on the last one. When "places" is empty, say that no place matches. When several places match, name them and ask which one is meant.`;

export function createSearchTaggedPlacesTool(runtime: TaggedPlacesReadRuntime) {
  return defineAssistantTool({
    description: DESCRIPTION,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The name, address or category, or part of it, to look for. Example: "louvre" for "did anyone go to the Louvre?".',
        ),
      offset: PageOffsetSchema,
    }),
    outputSchema: TaggedPlacePageSchema,
    execute: (input) => searchTaggedPlaces(runtime, input),
  });
}
