import { z } from "zod";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { UserSummaryRepository } from "@@/core/domains/database/repositories/user-summary-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import type { StoryOutputUser } from "@@/core/domains/fetch-run/report-types.ts";
import { getReportUserKey } from "@@/core/domains/accounts/report-user-key.ts";
import {
  readUserSummaries,
  resolveUserSummariesForReport,
  type RunUserSummary,
} from "@@/core/domains/accounts/user-summary.ts";
import type { InstagramUserEntry } from "@@/core/domains/database/entities/instagram-user.ts";
import { createStoryFeed, readStoryFeedVision } from "./story-feed.ts";

interface FeedUserSummariesRuntime {
  summaries: Pick<UserSummaryRepository, "findBySourceHash">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

type SummarizeStoryFeedRuntime = Parameters<typeof resolveUserSummariesForReport>[0] &
  Parameters<typeof createStoryFeed>[0] &
  Parameters<typeof readStoryFeedVision>[0];

/** Writes from the same feed and vision `readFeedUserSummaries` hashes to find a summary. */
export async function summarizeStoryFeed(
  runtime: SummarizeStoryFeedRuntime,
  now: Date,
  runUserSummary?: RunUserSummary,
): Promise<void> {
  const users = createStoryFeed(runtime, now);

  await resolveUserSummariesForReport(
    runtime,
    { output: { users } },
    { runUserSummary, visionByPreviewUrl: readStoryFeedVision(runtime, users) },
  );
}

export interface FeedUserSummaryRuntime extends FeedUserSummariesRuntime {
  stories: Pick<StoryRepository, "listActive">;
  users: Pick<InstagramUserRepository, "listAll">;
}

/** Read-only: a missing summary is never generated here. */
export function readFeedUserSummaries(
  runtime: FeedUserSummariesRuntime,
  users: Array<StoryOutputUser>,
): Map<string, string> {
  return readUserSummaries(runtime, users, {
    visionByPreviewUrl: readStoryFeedVision(runtime, users),
  });
}

export type FeedUserSummary =
  | { status: "found"; storyCount: number; summary: string; username: string }
  | { reason: "no_stories_in_last_24h" | "not_generated"; status: "missing"; username: string }
  | { error: "unknown_account"; status: "error" };

interface AccountsAndStoryFeed {
  accounts: Array<InstagramUserEntry>;
  feed: Array<StoryOutputUser>;
}

/** Ignores an `@` prefix and letter case. */
function readFeedUserSummary(
  runtime: FeedUserSummariesRuntime,
  { accounts, feed }: AccountsAndStoryFeed,
  username: string,
): FeedUserSummary {
  const wanted = username.trim().replace(/^@/u, "").toLowerCase();
  const account = accounts.find((user) => user.username.toLowerCase() === wanted);

  if (account === undefined) {
    return { error: "unknown_account", status: "error" };
  }

  const feedUser = feed.find((user) => user.username === account.username);

  if (feedUser === undefined) {
    return { reason: "no_stories_in_last_24h", status: "missing", username: account.username };
  }

  const summary = readFeedUserSummaries(runtime, [feedUser]).get(getReportUserKey(feedUser));

  if (summary === undefined) {
    return { reason: "not_generated", status: "missing", username: account.username };
  }

  return {
    status: "found",
    storyCount: feedUser.stories.length,
    summary,
    username: account.username,
  };
}

export interface RequestedFeedUserSummary {
  /** The account written as `@username`, for the Assistant to copy into its answer. */
  handle: string;
  outcome: FeedUserSummary;
  requestedUsername: string;
}

const FeedUserSummarySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    username: z.string(),
    storyCount: z.number(),
    summary: z.string(),
  }),
  z.object({
    status: z.literal("missing"),
    username: z.string(),
    reason: z.enum(["no_stories_in_last_24h", "not_generated"]),
  }),
  z.object({ status: z.literal("error"), error: z.literal("unknown_account") }),
]) satisfies z.ZodType<FeedUserSummary>;

export const RequestedFeedUserSummariesSchema = z.array(
  z.object({
    handle: z.string(),
    requestedUsername: z.string(),
    outcome: FeedUserSummarySchema,
  }),
) satisfies z.ZodType<Array<RequestedFeedUserSummary>>;

/** The user summaries of several accounts, in the order asked, each with the username asked for. */
export function readFeedUserSummariesByUsername(
  runtime: FeedUserSummaryRuntime,
  usernames: Array<string>,
  now: Date,
): Array<RequestedFeedUserSummary> {
  const accountsAndStoryFeed: AccountsAndStoryFeed = {
    accounts: runtime.users.listAll(),
    feed: createStoryFeed(runtime, now),
  };

  return usernames.map((requestedUsername) => {
    const outcome = readFeedUserSummary(runtime, accountsAndStoryFeed, requestedUsername);

    const username =
      outcome.status === "error" ? requestedUsername.trim().replace(/^@/u, "") : outcome.username;

    return { handle: `@${username}`, outcome, requestedUsername };
  });
}
