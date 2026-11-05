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
    description: `Lists observed mention connections over all retained story history, newest first, up to 10 pairs per page. A pair joins a story author and a mention-sticker target; storyCount counts distinct source stories in either direction. Repeated stickers count once. It never includes a pair solely because a third person mentioned both.
Use for "which mention connections are there?" or to list the connections of a person, including an unknown username or a separate name-only observation. Copy person ids from searchMentionConnections or a previous list; never invent ids. Use getMentionConnection with a pair's source.id and target.id for directional story evidence.
Outcomes: listed includes total and nextOffset (null at the end); offer more when nextOffset is non-null. unknown_person means this id is absent. An empty list means no retained mention observation, never proof people do not know each other. A mention does not prove personal acquaintance. Username matches use current usernames and are approximate historical identities; name-only observations are separate people unless clarified.`,
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
