import { tool } from "ai";
import { z } from "zod";
import {
  readFeedUserSummary,
  type FeedUserSummary,
  type FeedUserSummaryRuntime,
} from "./feed-user-summary.ts";

/** The result of the getFeedUserSummary tool. */
export const FeedUserSummaryOutputSchema = z.discriminatedUnion("status", [
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

const DESCRIPTION = `Returns the user summary of one saved Instagram account: a short text about the stories the account published in the last 24 hours, exactly as the story feed shows it, with the number of those stories.

Use it when the message mentions an account, usually as @username, and asks what the account posted, did or shared recently, today or in the last 24 hours.
Do not use it to list or discover the saved accounts, or for a message that names no account.

Outcomes, by "status":
- "found": "summary" is the stored user summary and "storyCount" the number of stories in the last 24 hours. Answer from the summary only.
- "missing" with reason "no_stories_in_last_24h": the account published no story in the last 24 hours. Say so.
- "missing" with reason "not_generated": the account has stories, but their summary is not generated yet; it will be after the next fetch run. Say so, and do not describe the stories.
- "error" with error "unknown_account": no saved account has this username. Say the account is unknown, and never invent a summary.`;

/** The Assistant tool reading the story feed's user summary of one account. Read-only. */
export function createGetFeedUserSummaryTool(runtime: FeedUserSummaryRuntime) {
  return tool({
    description: DESCRIPTION,
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
