import type { InstagramUserRepository } from "../entities/instagram-user.ts";
import { instagramUserRepository } from "./entity-repository-service.ts";
import type { InstagramUserEntry, StoriesManifestReport } from "./types.ts";

type InstagramUserFields = {
  full_name?: string | null;
  id?: string;
  pk?: string;
  profile_pic_url?: string | null;
  username: string;
};

type InstagramUserStore = Pick<InstagramUserRepository, "findByUsername" | "save">;

function hasEmbeddedUser(user: InstagramUserFields): boolean {
  return "full_name" in user || "id" in user || "pk" in user || "profile_pic_url" in user;
}

function toInstagramUser(user: InstagramUserFields): InstagramUserEntry {
  const { id, pk } = user;

  if (id === undefined || pk === undefined) {
    throw new Error(`Instagram user ${user.username} has no id or pk`);
  }

  return {
    full_name: user.full_name ?? null,
    id,
    pk,
    username: user.username,
  };
}

function removeEmbeddedUser(user: InstagramUserFields): void {
  delete user.full_name;
  delete user.id;
  delete user.pk;
  delete user.profile_pic_url;
}

export async function persistReportInstagramUsers(
  report: StoriesManifestReport,
  repository: InstagramUserStore = instagramUserRepository,
): Promise<void> {
  const usersByUsername = new Map<string, InstagramUserEntry>();

  for (const user of report.manifest.users) {
    if (hasEmbeddedUser(user)) usersByUsername.set(user.username, toInstagramUser(user));
  }
  for (const user of report.output.users) {
    if (!hasEmbeddedUser(user) || usersByUsername.has(user.username)) continue;
    usersByUsername.set(user.username, toInstagramUser(user));
  }

  for (const user of usersByUsername.values()) await repository.save(user);
  for (const user of [...report.manifest.users, ...report.output.users]) removeEmbeddedUser(user);
}

export async function hydrateReportInstagramUsers(
  report: StoriesManifestReport,
  repository: InstagramUserStore = instagramUserRepository,
): Promise<void> {
  const usersByUsername = new Map<string, InstagramUserEntry | null>();

  for (const user of [...report.manifest.users, ...report.output.users]) {
    if (hasEmbeddedUser(user)) continue;
    if (!usersByUsername.has(user.username)) {
      usersByUsername.set(user.username, await repository.findByUsername(user.username));
    }
    const entity = usersByUsername.get(user.username);
    if (entity !== null && entity !== undefined) {
      user.full_name = entity.full_name;
      user.profile_pic_url = `../images/avatars/${entity.pk}.jpg`;
    }
  }
}
