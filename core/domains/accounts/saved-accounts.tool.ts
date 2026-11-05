import { tool } from "ai";
import { z } from "zod";
import {
  listSavedAccounts,
  type SavedAccount,
  type SavedAccountsRuntime,
} from "./saved-accounts.ts";

const SavedAccountsOutputSchema = z.object({
  accounts: z.array(z.object({ fullName: z.string().nullable(), username: z.string() })),
}) satisfies z.ZodType<{ accounts: Array<SavedAccount> }>;

const DESCRIPTION = `Returns every saved Instagram account: the accounts whose stories Slopstagram collects, each with its username and its full name (null when Instagram gave none).

Use it when the message asks which accounts are saved, known or followed, or what the user can ask about. Example: "which accounts do you know?".
Do not use it when the message mentions an account, usually as @username: read that account's data with its own tool instead. Do not use it for a greeting or a message that is not about the accounts.

Outcomes: "accounts" lists the saved accounts by username, and is empty when no account is saved yet. The chat does not show this result to the user: write the answer yourself, naming each account as @username, say so when no account is saved, and never invent an account.`;

/** The Assistant tool listing the saved accounts. Read-only. */
export function createListAccountsTool(runtime: SavedAccountsRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({}),
    outputSchema: SavedAccountsOutputSchema,
    execute: () => ({ accounts: listSavedAccounts(runtime) }),
  });
}
