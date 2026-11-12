import { tool } from "ai";
import { z } from "zod";
import {
  readFeedUserSummariesByUsername,
  type FeedUserSummary,
  type RequestedFeedUserSummary,
  type FeedUserSummaryRuntime,
} from "./feed-user-summary.ts";

const FeedUserSummaryOutputSchema = z.discriminatedUnion("status", [
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

/**
 * The result of the getFeedUserSummaries tool. The evals parse it.
 *
 * @public
 */
export const FeedUserSummariesOutputSchema = z.array(
  z.object({
    handle: z.string(),
    requestedUsername: z.string(),
    outcome: FeedUserSummaryOutputSchema,
  }),
) satisfies z.ZodType<Array<RequestedFeedUserSummary>>;

const DESCRIPTION = `Returns the user summaries of one or more Instagram accounts: for each, a short text about the stories the account published in the last 24 hours, exactly as the story feed shows it, with the number of those stories.

Use it when the message mentions one or more accounts, usually as @username, and asks what they posted, did or shared recently, today or in the last 24 hours, or compares, filters or ranks them: who posted what, who talks about a subject, whether accounts are together, which one is local.
Do not use it to list or discover the accounts, or for a message that names no account.

The result lists, in the order asked, each "requestedUsername" with its "handle" (the account written as @username: copy it as is when you name the account) and its "outcome", whose "status" is:
- "found": "summary" is the stored user summary and "storyCount" the number of stories in the last 24 hours.
- "missing" with reason "no_stories_in_last_24h": the account published no story in the last 24 hours.
- "missing" with reason "not_generated": the account has stories, but their summary is not generated yet; it will be after the next fetch run.
- "error" with error "unknown_account": no account has this username.
The chat does not show this result to the user: write the answer yourself from the summaries only, and never invent one.`;

/** The Assistant tool reading the story feed's user summaries of accounts. Read-only. */
export function createGetFeedUserSummariesTool(runtime: FeedUserSummaryRuntime) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      usernames: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe(
          'The accounts\' Instagram usernames, as mentioned in the message. An "@" prefix and letter case are ignored. Example: ["user_072", "user_008"] for "who posted more, @user_072 or @user_008?".',
        ),
    }),
    outputSchema: FeedUserSummariesOutputSchema,
    execute: ({ usernames }) => readFeedUserSummariesByUsername(runtime, usernames, new Date()),
  });
}
