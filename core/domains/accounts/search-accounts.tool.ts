import { tool } from "ai";
import { z } from "zod";
import {
  AccountSchema,
  searchAccounts,
  type AccountSearch,
  type AccountsRuntime,
} from "./accounts.ts";

const OutputSchema = z.object({
  accounts: z.array(AccountSchema),
  total: z.number(),
}) satisfies z.ZodType<AccountSearch>;

const DESCRIPTION = `Searches the Instagram accounts by name: the accounts whose username or full name contains the query, ignoring case and accents. Each result has its username, its handle (the account written as @username: copy it as is when you name the account) and its full name (null when Instagram gave none).

Use it when the message names an account by its name or part of it, without an @username, to find the account: "what does Alice post?" or "do we follow someone called Bob?". Then read the account's data with its own tool, using the username you found.
Do not use it when the message mentions an account as @username, or to list every account: use listAccounts. Do not use it for a greeting or a message that is not about the accounts.

Outcomes: "accounts" holds up to 10 matches, the closest first, and "total" counts every match: say so when there are more. It is empty when no account matches: say so, and never invent an account. When several accounts match, do not pick one for the user: name them and ask which one is meant. The chat hides this result from the user behind a collapsed line: write the answer yourself.`;

/** The Assistant tool searching the accounts by name. Read-only. */
export function createSearchAccountsTool(runtime: AccountsRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The name, or part of it, to look for in usernames and full names. Example: "alice" for "what does Alice post?".',
        ),
    }),
    outputSchema: OutputSchema,
    execute: ({ query }) => searchAccounts(runtime, query),
  });
}
