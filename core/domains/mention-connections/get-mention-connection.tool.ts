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
    description: `Reads one pair's observed mention connection across all retained history, independently of graph page filters. Copy both opaque person ids from searchMentionConnections or listMentionConnections; never invent ids. Known accounts, unknown usernames and distinct name-only observations are supported. Search and ask for clarification first when a label matches several people.
Outcomes: found gives connection.storyCount (distinct stories in either direction) and up to 5 evidence items, each with storyId, ISO date (null if unknown), author and target. The author mentioned the target; do not reverse that direction. Repeated stickers appear once. nextOffset is null on the last page; say when more evidence exists and offer the next page. no_observation means no retained source story connects the pair, not that they do not know each other. unknown_person means an id is absent; search again or say so.
An observed mention does not establish friendship, acquaintance or any personal relationship. Username matches use the current username and may misattribute historical mentions after a change or reassignment. Name-only points are separate observations; ambiguous username candidates are not proven identities. Never claim two people know each other from this data.`,
    inputSchema: z.object({
      sourceId: z
        .string()
        .describe(
          'One person id copied exactly from a search or list result, e.g. "account:synthetic-a".',
        ),
      targetId: z
        .string()
        .describe(
          'The other person id copied exactly from a search or list result, e.g. "username:synthetic_friend".',
        ),
      offset: MentionOffsetSchema,
    }),
    outputSchema: MentionConnectionReadSchema,
    execute: (input) => getMentionConnection(runtime, input),
  });
}
