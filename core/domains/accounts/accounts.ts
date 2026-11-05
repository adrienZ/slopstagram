import { z } from "zod";
import { normalizeSearchQuery, rankTextMatch } from "@@/core/utils/search-text.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";

export interface AccountsRuntime {
  users: Pick<InstagramUserRepository, "listAll">;
}

export interface Account {
  fullName: string | null;
  /** The account written as `@username`, for the Assistant to copy into its answer. */
  handle: string;
  username: string;
}

export const AccountSchema = z.object({
  fullName: z.string().nullable(),
  handle: z.string(),
  username: z.string(),
}) satisfies z.ZodType<Account>;

/** The accounts, by username. */
export function listAccounts(runtime: AccountsRuntime): Array<Account> {
  return runtime.users
    .listAll()
    .map(({ full_name: fullName, username }) => ({ fullName, handle: `@${username}`, username }));
}

export interface AccountSearch {
  accounts: Array<Account>;
  /** How many accounts match, which exceeds `accounts` when the results are cut. */
  total: number;
}

const MAX_SEARCH_RESULTS = 10;

/** How well an account matches a normalized query: lower is better, null means no match. */
function rankMatch(account: Account, query: string): number | null {
  return (
    rankTextMatch(account.username, query) ??
    (rankTextMatch(account.fullName ?? "", query) === null ? null : 3)
  );
}

/**
 * The accounts whose username or full name contains the query, ignoring case, accents and
 * a leading `@`: the exact username first, then the usernames starting with it, then the others.
 */
export function searchAccounts(
  runtime: AccountsRuntime,
  query: string,
  limit = MAX_SEARCH_RESULTS,
): AccountSearch {
  const wanted = normalizeSearchQuery(query);
  if (wanted === "") {
    return { accounts: [], total: 0 };
  }
  const matches = listAccounts(runtime).flatMap((account) => {
    const rank = rankMatch(account, wanted);
    return rank === null ? [] : [{ account, rank }];
  });
  matches.sort((left, right) => left.rank - right.rank);
  return {
    accounts: matches.slice(0, limit).map(({ account }) => account),
    total: matches.length,
  };
}
