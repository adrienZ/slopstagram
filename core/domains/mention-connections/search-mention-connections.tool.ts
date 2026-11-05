import { tool } from "ai";
import { z } from "zod";
import {
  MentionConnectionSearchSchema,
  MentionOffsetSchema,
  searchMentionConnections,
} from "./mention-connection-reads.ts";
import type { MentionConnectionsRuntime } from "./mention-connections.ts";

/** Finds the distinct people represented by retained mention observations or saved accounts. */
export function createSearchMentionConnectionsTool(runtime: MentionConnectionsRuntime) {
  return tool({
    description: `Finds people by username or name for mention-connection questions. Includes saved accounts, unknown usernames, and separate name-only observations. Returns up to 10 distinct identities with id, label, kind and connectionCount.
Use to discover a person's connections or clarify an ambiguous name. For TWO named people, use getMentionConnection directly with their usernames/names.
requiresClarification=true: show the separate candidates and ASK WHICH ONE is meant. Never merge equal names or choose an identity yourself. Copy a chosen id exactly for subsequent reads. nextOffset means more matches exist. Username identity is approximate because usernames can change.`,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The name or username to find, e.g. "synthetic_friend" or "Synthetic Guest". Search the people separately for a pair.',
        ),
      offset: MentionOffsetSchema,
    }),
    outputSchema: MentionConnectionSearchSchema,
    execute: (input) => searchMentionConnections(runtime, input),
  });
}
