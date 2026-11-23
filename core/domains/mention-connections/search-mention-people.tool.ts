import { defineAssistantTool } from "@@/core/utils/assistant-tool.ts";
import { z } from "zod";
import { PageOffsetSchema } from "@@/core/utils/paging.ts";
import {
  MENTION_PERSON_KINDS_DESCRIPTION,
  MentionPeoplePageSchema,
  searchMentionPeople,
} from "./mention-connection-reads.ts";
import type { MentionConnectionsRuntime } from "./mention-connections.ts";

const DESCRIPTION = `Searches the Mention people, the people at either end of a Mention connection, whose username or full name contains the query, ignoring case and accents, the closest first. Covers saved Accounts, usernames no saved Account has, and full names a sticker carries without a username. Each person has its id (copy it as is), its kind, its label, its connection and story counts, the date of its latest story and the labels of whom it is connected to.

Use it when the message names someone of the mentions by part of a name or username: "did anyone mention someone called Bob?". Then read their connections with listMentionConnections or getMentionConnection, using the id you found.
Do not use it with a full username or two people: use listMentionConnections or getMentionConnection directly.

Outcomes: "people" holds up to 10 matches, "total" counts every match and "nextOffset" is the offset of the next page, null on the last one. Equal full names from different stories are different people, with different ids. When "people" is empty, no stored mention involves anyone matching.
${MENTION_PERSON_KINDS_DESCRIPTION}`;

/** The Assistant tool searching the Mention people by name. Read-only. */
export function createSearchMentionPeopleTool(runtime: MentionConnectionsRuntime) {
  return defineAssistantTool({
    description: DESCRIPTION,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The name or username, or part of it, to look for. Example: "bob" for "did anyone mention someone called Bob?".',
        ),
      offset: PageOffsetSchema,
    }),
    outputSchema: MentionPeoplePageSchema,
    execute: (input) => searchMentionPeople(runtime, input),
  });
}
