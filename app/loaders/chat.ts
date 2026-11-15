import "@tanstack/react-start/server-only";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

export function loadChatPage(runtime: { users: Pick<InstagramUserRepository, "listAll"> }) {
  return { accounts: loadSidebarUsers(runtime) };
}

export type ChatPageData = ReturnType<typeof loadChatPage>;
