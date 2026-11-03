import type { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/database/repositories/story-repository.ts";
import type { UserSummaryRepository } from "@@/core/database/repositories/user-summary-repository.ts";
import type { VisionRepository } from "@@/core/database/repositories/vision-repository.ts";
import { createStoryFeed, readStoryFeedVision } from "@@/core/story-feed/story-feed.ts";
import { getReportUserKey } from "@@/core/accounts/report-user-key.ts";
import { readUserSummaries } from "@@/core/accounts/user-summary.ts";

export interface ListedAccount {
  fullName: string | null;
  username: string;
}

export interface RecentUserSummary {
  storyCount: number;
  summary: string | null;
  username: string;
}

export function listAccounts(runtime: {
  users: Pick<InstagramUserRepository, "listAll">;
}): Array<ListedAccount> {
  return runtime.users
    .listAll()
    .map((user) => ({ fullName: user.full_name, username: user.username }));
}

/**
 * The user summary the report page shows for an account's stories of the last 24 hours.
 * Null when no saved account has that username (an `@` prefix and letter case are ignored).
 */
export function findRecentUserSummary(
  runtime: {
    stories: Pick<StoryRepository, "listActive">;
    summaries: Pick<UserSummaryRepository, "findBySourceHash">;
    users: Pick<InstagramUserRepository, "listAll">;
    vision: Pick<VisionRepository, "findByMediaPk">;
  },
  mention: string,
  now: Date,
): RecentUserSummary | null {
  const wanted = mention.replace(/^@/u, "").toLowerCase();
  const account = listAccounts(runtime).find(({ username }) => username.toLowerCase() === wanted);
  if (account === undefined) {
    return null;
  }

  const feedUser = createStoryFeed(runtime, now).find(
    ({ username }) => username === account.username,
  );
  if (feedUser === undefined) {
    return { storyCount: 0, summary: null, username: account.username };
  }

  const visionByPreviewUrl = readStoryFeedVision(runtime, [feedUser]);
  const summaries = readUserSummaries(runtime, [feedUser], { visionByPreviewUrl });
  return {
    storyCount: feedUser.stories.length,
    summary: summaries.get(getReportUserKey(feedUser)) ?? null,
    username: account.username,
  };
}
