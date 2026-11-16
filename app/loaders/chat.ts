import { createServerFn } from "@tanstack/react-start";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

/**
 * Served through the server function below; tests load the page over their own runtime.
 *
 * @internal
 */
export function loadChatPage(runtime: { users: Pick<InstagramUserRepository, "listAll"> }) {
  return { accounts: loadSidebarUsers(runtime) };
}

export type ChatPageData = ReturnType<typeof loadChatPage>;

export const getChatPage = createServerFn({ method: "GET" }).handler(() =>
  loadChatPage(getProductionRuntime()),
);
