import { tool } from "ai";
import { z } from "zod";
import { listAccounts, AccountSchema, type Account, type AccountsRuntime } from "./accounts.ts";

const OutputSchema = z.object({
  accounts: z.array(AccountSchema),
}) satisfies z.ZodType<{ accounts: Array<Account> }>;

const DESCRIPTION = `Returns every account: the Instagram accounts whose stories Slopstagram collects, each with its username, its handle (the account written as @username: copy it as is when you name the account) and its full name (null when Instagram gave none).

Use it when the message asks which accounts are collected, known or followed, or what the user can ask about. Example: "which accounts do you know?".
Do not use it when the message mentions an account, usually as @username: read that account's data with its own tool instead. Do not use it for a greeting or a message that is not about the accounts.

Outcomes: "accounts" lists the accounts by username, and is empty when no account has been collected yet. The chat shows this result to the user only as a collapsed line: write the answer yourself, naming each account by its handle, say so when there is no account, and never invent an account.`;

/** The Assistant tool listing the accounts. Read-only. */
export function createListAccountsTool(runtime: AccountsRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({}),
    outputSchema: OutputSchema,
    execute: () => ({ accounts: listAccounts(runtime) }),
  });
}
