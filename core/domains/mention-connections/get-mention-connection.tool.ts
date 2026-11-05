import { tool } from "ai";
import { z } from "zod";
import {
  getMentionConnection,
  MentionConnectionReadSchema,
  MentionOffsetSchema,
} from "./mention-connection-reads.ts";
import type { MentionConnectionsRuntime } from "./mention-connections.ts";

/** Reads the retained directional evidence of one pair, five stories at a time. */
export function createGetMentionConnectionTool(runtime: MentionConnectionsRuntime) {
  return tool({
    description: `Call this when asked whether TWO people know each other or who mentioned whom. Pass both usernames or names, e.g. firstPerson="user_072", secondPerson="user_008". No account lookup needed.
found: up to 5 stories (storyId, date, author, target); the author mentioned the target. no_observation: no mention found, which does NOT prove they do not know each other. ambiguous: ask which candidate is meant. A mention never proves acquaintance; personalRelationship is always unknown.`,
    inputSchema: z.object({
      firstPerson: z
        .string()
        .describe('First username, full name, or result id. Example: "user_072".'),
      secondPerson: z
        .string()
        .describe('Second username, full name, or result id. Example: "synthetic_guest".'),
      offset: MentionOffsetSchema,
    }),
    outputSchema: MentionConnectionReadSchema,
    execute: ({ firstPerson, secondPerson, offset }) =>
      getMentionConnection(runtime, { sourceId: firstPerson, targetId: secondPerson, offset }),
  });
}
