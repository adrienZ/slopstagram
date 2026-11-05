import { tool } from "ai";
import { z } from "zod";
import {
  listMentionConnections,
  MentionConnectionListSchema,
  MentionOffsetSchema,
} from "./mention-connection-reads.ts";
import type { MentionConnectionsRuntime } from "./mention-connections.ts";

/** Lists observed pairs over retained history, independently of the graph page's filters. */
export function createListMentionConnectionsTool(runtime: MentionConnectionsRuntime) {
  return tool({
    description: `Lists observed mention pairs across ALL saved history, up to 10 per page. Use for "which mention connections are there?". For a question about TWO named people, use getMentionConnection directly instead.
Each pair has source, target and storyCount. These endpoints are unordered: list results do not say who mentioned whom. Read getMentionConnection for that direction and the source stories. Repeated stickers in one story count once. nextOffset is null on the last page; offer more if present.
A mention is not proof of acquaintance. An empty list is not proof people do not know each other. Optional personId must be copied from search/list results.`,
    inputSchema: z.object({
      personId: z
        .string()
        .optional()
        .describe(
          'A person id copied exactly from search or list results, such as "username:synthetic_friend". Leave it out for every connection.',
        ),
      offset: MentionOffsetSchema,
    }),
    outputSchema: MentionConnectionListSchema,
    execute: (input) => listMentionConnections(runtime, input),
  });
}
