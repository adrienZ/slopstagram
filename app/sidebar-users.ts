import "@tanstack/react-start/server-only";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";

export interface SidebarUser {
  username: string;
  avatarPath: string;
}

export function loadSidebarUsers(): Array<SidebarUser> {
  return instagramUserRepository.listAll().map((user) => ({
    username: user.username,
    avatarPath: `/media/avatars/${user.pk}.jpg`,
  }));
}
