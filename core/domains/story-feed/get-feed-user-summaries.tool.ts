import { tool } from "ai";
import { z } from "zod";
import {
  readFeedUserSummariesByUsername,
  RequestedFeedUserSummariesSchema,
  type FeedUserSummaryRuntime,
} from "./feed-user-summary.ts";

const DESCRIPTION = `Returns the user summaries of one or more Instagram accounts: for each, a short text about the stories the account published in the last 24 hours, exactly as the story feed shows it, with the number of those stories.

Use it when the message mentions one or more accounts, usually as @username, and asks what they posted, did or shared recently, today or in the last 24 hours, or compares, filters or ranks them: who posted what, who talks about a subject, whether accounts are together, which one is local.
Do not use it to list or discover the accounts, or for a message that names no account.

The result lists, in the order asked, each "requestedUsername" with its "handle" (the account written as @username: copy it as is when you name the account) and its "outcome", whose "status" is:
- "found": "summary" is the stored user summary and "storyCount" the number of stories in the last 24 hours.
- "missing" with reason "no_stories_in_last_24h": the account published no story in the last 24 hours.
- "missing" with reason "not_generated": the account has stories, but their summary is not generated yet; it will be after the next fetch run.
- "error" with error "unknown_account": no account has this username.
The chat shows this result to the user only as a collapsed line: write the answer yourself from the summaries only, and never invent one.`;

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
    outputSchema: RequestedFeedUserSummariesSchema,
    execute: ({ usernames }) => readFeedUserSummariesByUsername(runtime, usernames, new Date()),
  });
}
