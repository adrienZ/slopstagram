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
    description: `Searches people to inspect their mention connections, by username or full name, ignoring case and accents. Includes known accounts, unknown usernames and separate name-only story observations. Returns up to 10 identities, each with an opaque id, kind, label, connectionCount and latestStoryDate. Saved accounts with no connection are searchable too.
Use when asking about mentions, connections, or whether two people know each other. Search each person's name or username, then copy their ids exactly into getMentionConnection; use listMentionConnections with a personId for their neighbors. Never guess ids or assume equal full names identify the same person.
When requiresClarification is true, present the distinct candidates and ask which observation/person is meant before choosing. An ambiguous username's candidateAccountIds are possibilities, not established identity. total counts every match; nextOffset is null on the last page. No match means no matching identity in retained data, never proof people do not know each other. Username matching is approximate because current usernames can change or be reassigned.`,
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
