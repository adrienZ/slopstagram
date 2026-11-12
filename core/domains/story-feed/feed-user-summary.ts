import { z } from "zod";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { UserSummaryRepository } from "@@/core/domains/database/repositories/user-summary-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import type { StoryOutputUser } from "@@/core/domains/fetch-run/report-types.ts";
import { getReportUserKey } from "@@/core/domains/accounts/report-user-key.ts";
import { readUserSummaries } from "@@/core/domains/accounts/user-summary.ts";
import { createStoryFeed, readStoryFeedVision } from "./story-feed.ts";

interface FeedUserSummariesRuntime {
  summaries: Pick<UserSummaryRepository, "findBySourceHash">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

export interface FeedUserSummaryRuntime extends FeedUserSummariesRuntime {
  stories: Pick<StoryRepository, "listActive">;
  users: Pick<InstagramUserRepository, "listAll">;
}

/**
 * The stored user summaries of the story feed's accounts, by report user key. Read-only: an
 * account whose summary was not generated has no entry, and none is generated.
 */
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

/**
 * The user summary the story feed shows for one account's stories of the last 24 hours. The
 * username ignores an `@` prefix and letter case.
 */
export function readFeedUserSummary(
  runtime: FeedUserSummaryRuntime,
  username: string,
  now: Date,
): FeedUserSummary {
  const wanted = username.trim().replace(/^@/u, "").toLowerCase();
  const account = runtime.users.listAll().find((user) => user.username.toLowerCase() === wanted);
  if (account === undefined) {
    return { error: "unknown_account", status: "error" };
  }
  const feedUser = createStoryFeed(runtime, now).find((user) => user.username === account.username);
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

/** The user summaries of several accounts, as the getFeedUserSummaries tool returns them. */
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
  return usernames.map((requestedUsername) => {
    const outcome = readFeedUserSummary(runtime, requestedUsername, now);
    const username =
      outcome.status === "error" ? requestedUsername.trim().replace(/^@/u, "") : outcome.username;
    return { handle: `@${username}`, outcome, requestedUsername };
  });
}
