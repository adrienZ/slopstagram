import type { InstagramUserRepository } from "../entities/instagram-user.ts";
import { instagramUserRepository } from "./entity-repository-service.ts";
import type { InstagramUserEntry, StoriesManifestReport } from "./types.ts";

interface InstagramUserFields {
  full_name?: string | null;
  id?: string;
  pk?: string;
  profile_pic_url?: string | null;
  username: string;
}

type InstagramUserStore = Pick<InstagramUserRepository, "findByUsername" | "save">;

function hasEmbeddedUser(user: InstagramUserFields): boolean {
  return (
    (user.full_name !== null && user.full_name !== undefined) ||
    user.id !== undefined ||
    user.pk !== undefined ||
    (user.profile_pic_url !== null && user.profile_pic_url !== undefined)
  );
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
    if (hasEmbeddedUser(user)) {
      usersByUsername.set(user.username, toInstagramUser(user));
    }
  }
  for (const user of report.output.users) {
    if (!hasEmbeddedUser(user) || usersByUsername.has(user.username)) {
      continue;
    }
    usersByUsername.set(user.username, toInstagramUser(user));
  }

  await Promise.all(
    [...usersByUsername.values()].map(async (user) => {
      await repository.save(user);
    }),
  );
  for (const user of [...report.manifest.users, ...report.output.users]) {
    removeEmbeddedUser(user);
  }
}

export function hydrateReportInstagramUsers(
  report: StoriesManifestReport,
  repository: InstagramUserStore = instagramUserRepository,
): void {
  const usersByUsername = new Map<string, InstagramUserEntry | null>();

  const users = [...report.manifest.users, ...report.output.users];
  const missingUsernames = new Set(
    users.filter((user) => !hasEmbeddedUser(user)).map((user) => user.username),
  );
  const entries = [...missingUsernames].map(
    (username) => [username, repository.findByUsername(username)] as const,
  );
  for (const [username, entity] of entries) {
    usersByUsername.set(username, entity);
  }

  for (const user of users) {
    if (hasEmbeddedUser(user)) {
      continue;
    }
    const entity = usersByUsername.get(user.username);
    if (entity !== null && entity !== undefined) {
      user.full_name = entity.full_name;
      user.profile_pic_url = `images/avatars/${entity.pk}.jpg`;
    }
  }
}
