import { tool } from "ai";
import { z } from "zod";
import {
  readFeedUserSummariesByUsername,
  readFeedUserSummary,
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

const FeedUserSummariesOutputSchema = z.array(
  z.object({ requestedUsername: z.string(), outcome: FeedUserSummaryOutputSchema }),
) satisfies z.ZodType<Array<RequestedFeedUserSummary>>;

const DESCRIPTION = `Returns the user summary of ONE saved Instagram account: a short text about the stories the account published in the last 24 hours, exactly as the story feed shows it, with the number of those stories.

Use it when the message mentions exactly one account, usually as @username, and simply asks what the account posted, did or shared recently, today or in the last 24 hours. The chat shows the result to the user as a card, and the reply ends there.
Do not use it when the message mentions two or more accounts, or compares, filters or ranks accounts: use getFeedUserSummaries. Do not use it to list or discover the saved accounts, or for a message that names no account.

Outcomes, by "status":
- "found": "summary" is the stored user summary and "storyCount" the number of stories in the last 24 hours.
- "missing" with reason "no_stories_in_last_24h": the account published no story in the last 24 hours.
- "missing" with reason "not_generated": the account has stories, but their summary is not generated yet; it will be after the next fetch run.
- "error" with error "unknown_account": no saved account has this username.`;

const SUMMARIES_DESCRIPTION = `Returns the user summaries of several saved Instagram accounts at once, each as in getFeedUserSummary: a short text about the stories the account published in the last 24 hours, with the number of those stories.

Use it when the message mentions two or more accounts, usually as @username, or compares, filters or ranks them: who posted what, who talks about a subject, whether accounts are together, which one is local.
Do not use it for a single account that is simply asked about: use getFeedUserSummary.

The result lists, in the order asked, each "requestedUsername" with its "outcome", whose "status" is "found" (with the summary and "storyCount"), "missing" (no story in the last 24 hours, or the summary is not generated yet) or "error" (no saved account has this username). The chat does not show this result to the user: write the answer yourself from the summaries only, compare the accounts as asked, say which accounts have no summary, and never invent one.`;

/**
 * The Assistant tool reading the story feed's user summary of one account. Read-only. The chat
 * renders its result as a card, so the Assistant writes nothing after it.
 */
export function createGetFeedUserSummaryTool(runtime: FeedUserSummaryRuntime) {
  return tool({
    description: DESCRIPTION,
    metadata: { renderedAs: "card" },
    inputSchema: z.object({
      username: z
        .string()
        .describe(
          'The account\'s Instagram username, as mentioned in the message. An "@" prefix and letter case are ignored. Example: "user_072" for "what did @user_072 post today?".',
        ),
    }),
    outputSchema: FeedUserSummaryOutputSchema,
    execute: ({ username }) => readFeedUserSummary(runtime, username, new Date()),
  });
}

/** The Assistant tool reading the story feed's user summaries of several accounts. Read-only. */
export function createGetFeedUserSummariesTool(runtime: FeedUserSummaryRuntime) {
  return tool({
    description: SUMMARIES_DESCRIPTION,
    inputSchema: z.object({
      usernames: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe(
          'The accounts\' Instagram usernames, as mentioned in the message. An "@" prefix and letter case are ignored. Example: ["user_072", "user_008"] for "who posted more, @user_072 or @user_008?".',
        ),
    }),
    outputSchema: FeedUserSummariesOutputSchema,
    execute: ({ usernames }) => readFeedUserSummariesByUsername(runtime, usernames, new Date()),
  });
}
