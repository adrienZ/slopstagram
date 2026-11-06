import "@tanstack/react-start/server-only";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import { loadSidebarUsers } from "@/loaders/sidebar-users.ts";

/** The accounts the chat page renders in its stickers, with their avatar path. */
export function loadChatPage(runtime: { users: Pick<InstagramUserRepository, "listAll"> }) {
  return { accounts: loadSidebarUsers(runtime) };
}

export type ChatPageData = ReturnType<typeof loadChatPage>;
