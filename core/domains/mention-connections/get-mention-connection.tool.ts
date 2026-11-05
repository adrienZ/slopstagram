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
    description: `Checks the mention connection between TWO PEOPLE over ALL saved story history. Call directly when asked whether @alice and @bob know each other or who mentioned whom. Pass their usernames or names, e.g. firstPerson="user_072", secondPerson="user_008". No preliminary account lookup is needed. Opaque ids from previous results also work.
found: up to 5 stories with storyId, date, author and target. The author mentioned the target. storyCount counts distinct stories in either direction. nextOffset means more evidence exists.
no_observation: no retained mention connects them; this does NOT prove they do not know each other. unknown_person: no matching saved identity. ambiguous: ask which candidate is meant, then retry using their exact id. Never choose equal-name candidates yourself.
A mention does NOT prove personal acquaintance. Current usernames can change or be reassigned. Answer briefly from the result only.`,
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
