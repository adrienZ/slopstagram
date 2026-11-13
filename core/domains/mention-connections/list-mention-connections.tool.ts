import { tool } from "ai";
import { z } from "zod";
import {
  listMentionConnections,
  MentionConnectionListSchema,
  MentionOffsetSchema,
} from "./mention-connection-reads.ts";
import type { MentionConnectionsRuntime } from "./mention-connections.ts";

const DESCRIPTION = `Lists the Mention connections over every stored story, of one person or of everyone, the connection of the latest story first. A Mention connection links a story's author and someone a mention sticker of that story names. Each connection has its two people (each with its id, its kind and its label: @username, or the full name a sticker carries without a username), its story count, the date of its latest story, and "mentions": who mentioned whom, in how many stories.

Use it when the message asks who mentioned or was mentioned by someone, whom someone is connected to, or which Mention connections there are: "who mentioned @alice?", "which mentions are there?".
Do not use it for two given people: use getMentionConnection. Do not use it to find someone by part of a name: use searchMentionConnections.

Outcomes: "listed" holds up to 10 connections; "total" counts every connection and "nextOffset" is the offset of the next page, null on the last one; "person" is whom the list is about, null for everyone; an empty list means no stored story mentions them or was posted by them mentioning someone. "unknown_person": no Account, username or full name in the stored mentions equals the query. "ambiguous": several people have this full name; "candidates" are those people, apart, with their ids.
Kinds: "account" is a saved Account, "unknown-username" a username no Account has, "ambiguous-username" a username several Accounts share ("accounts"), "name" a full name one story's sticker carries.`;

/** The Assistant tool listing the Mention connections, of one person or everyone. Read-only. */
export function createListMentionConnectionsTool(runtime: MentionConnectionsRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      person: z
        .string()
        .optional()
        .describe(
          'Only the connections of this person: a username, a full name, or an id from an earlier result, copied as is. Example: "alice" for "who mentioned @alice?". Leave it out for everyone.',
        ),
      offset: MentionOffsetSchema,
    }),
    outputSchema: MentionConnectionListSchema,
    execute: (input) => listMentionConnections(runtime, input),
  });
}
