import { tool } from "ai";
import { z } from "zod";
import { listAccounts, AccountSchema, type Account, type AccountsRuntime } from "./accounts.ts";

const OutputSchema = z.object({
  accounts: z.array(AccountSchema),
}) satisfies z.ZodType<{ accounts: Array<Account> }>;

const DESCRIPTION = `Returns every account: the Instagram accounts whose stories Slopstagram collects, each with its username, its handle (@username: copy it as is to name the account) and its full name (null when Instagram gave none).

Use it when the message asks which accounts are collected, known or followed, or what the user can ask about: "which accounts do you know?".
Do not use it when the message mentions an account, usually as @username: read that account's data with its own tool instead.

Outcomes: "accounts" lists the accounts by username, and is empty when no account has been collected yet: say so.`;

/** The Assistant tool listing the accounts. Read-only. */
export function createListAccountsTool(runtime: AccountsRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({}),
    outputSchema: OutputSchema,
    execute: () => ({ accounts: listAccounts(runtime) }),
  });
}
