import "@tanstack/react-start/server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { BASE_CACHE_DIR } from "../sdk/lib/cache-service.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";

export interface SidebarUser {
  username: string;
  avatarPath: string | null;
}

export function loadSidebarUsers(): Array<SidebarUser> {
  return instagramUserRepository.listAll().map((user) => ({
    username: user.username,
    avatarPath: existsSync(path.join(BASE_CACHE_DIR, "images", "avatars", `${user.pk}.jpg`))
      ? `/media/avatars/${user.pk}.jpg`
      : null,
  }));
}
