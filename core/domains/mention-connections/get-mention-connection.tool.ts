import { tool } from "ai";
import { z } from "zod";
import {
  getMentionConnection,
  MentionConnectionReadSchema,
  MentionOffsetSchema,
} from "./mention-connection-reads.ts";
import type { MentionConnectionsRuntime } from "./mention-connections.ts";

const DESCRIPTION = `Reads the Mention connection between two people over every stored story: whether a story of one mentions the other, the story count, "mentions" (who mentioned whom, in how many stories), and up to 5 of its source stories, the latest first, each with its story id, date, author and whom the author mentioned.

Use it when the message asks about two people: whether they are connected, who mentioned whom, or whether they know each other: "do @alice and @bob know each other?".
Do not use it for one person: use listMentionConnections. With only part of a name, call searchMentionConnections first.

Outcomes: "found" with the connection; "nextOffset" is the offset of the next stories, null when there are no more. "no_observation": no stored story of one mentions the other. "unknown_person": no Account, username or full name in the stored mentions equals the queries listed. "ambiguous": several people have one of these full names; each match lists its "candidates", apart, with their ids.
Kinds: "account" is a saved Account, "unknown-username" a username no Account has, "ambiguous-username" a username several Accounts share ("accounts"), "name" a full name one story's sticker carries.`;

/** The Assistant tool reading the Mention connection of two people and its source stories. Read-only. */
export function createGetMentionConnectionTool(runtime: MentionConnectionsRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      firstPerson: z
        .string()
        .describe(
          'A username, a full name, or an id from an earlier result, copied as is. Example: "alice" for "do @alice and @bob know each other?".',
        ),
      secondPerson: z
        .string()
        .describe('The other person, the same way. Example: "bob" for the question above.'),
      offset: MentionOffsetSchema,
    }),
    outputSchema: MentionConnectionReadSchema,
    execute: (input) => getMentionConnection(runtime, input),
  });
}
