import "@tanstack/react-start/server-only";
import type { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";

export interface SidebarUser {
  username: string;
  avatarPath: string;
}

export function loadSidebarUsers(runtime: {
  users: Pick<InstagramUserRepository, "listAll">;
}): Array<SidebarUser> {
  return runtime.users.listAll().map((user) => ({
    username: user.username,
    avatarPath: `/media/avatars/${user.pk}.jpg`,
  }));
}
