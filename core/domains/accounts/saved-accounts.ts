import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";

export interface SavedAccountsRuntime {
  users: Pick<InstagramUserRepository, "listAll">;
}

export interface SavedAccount {
  fullName: string | null;
  username: string;
}

/** The saved accounts, by username. */
export function listSavedAccounts(runtime: SavedAccountsRuntime): Array<SavedAccount> {
  return runtime.users
    .listAll()
    .map(({ full_name: fullName, username }) => ({ fullName, username }));
}
