import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import domainLayering from "../../oxlint/plugins/rules/domain-layering.ts";

// The tester registers its cases through vitest's suite functions.
RuleTester.describe = (text, fn) => {
  describe(text, fn);
};
RuleTester.it = (text, fn) => {
  it(text, fn);
};

function inDomain(module: string): string {
  return `/repo/core/domains/${module}`;
}

new RuleTester().run("domain-layering", domainLayering, {
  valid: [
    {
      name: "the Assistant composes mention-connection tools",
      code: 'import { createGetMentionConnectionTool } from "@@/core/domains/mention-connections/get-mention-connection.tool.ts";',
      filename: inDomain("assistant/assistant.ts"),
    },
    {
      name: "mention connections reuse domain-free text matching",
      code: 'import { normalizeSearchQuery } from "@@/core/utils/search-text.ts";',
      filename: inDomain("mention-connections/mention-connection-reads.ts"),
    },
    {
      name: "the story feed imports the accounts domain",
      code: 'import { readUserSummaries } from "@@/core/domains/accounts/user-summary.ts";',
      filename: inDomain("story-feed/feed-user-summary.ts"),
    },
    {
      name: "a relative import of the accounts domain from the story feed",
      code: 'import { getReportUserKey } from "../accounts/report-user-key.ts";',
      filename: inDomain("story-feed/feed-user-summary.ts"),
    },
    {
      name: "a type-only import may point up",
      code: 'import type { StoryOutputUser } from "@@/core/domains/fetch-run/report-types.ts";',
      filename: inDomain("story-feed/story-feed.ts"),
    },
    {
      name: "the Assistant domain imports the domains whose tools it composes",
      code: 'import { createGetFeedUserSummaryTool } from "@@/core/domains/story-feed/get-feed-user-summaries.tool.ts";',
      filename: inDomain("assistant/assistant.ts"),
    },
  ],
  invalid: [
    {
      name: "mention connections cannot import the Assistant they expose tools to",
      code: 'import { streamAssistantReply } from "@@/core/domains/assistant/assistant.ts";',
      filename: inDomain("mention-connections/get-mention-connection.tool.ts"),
      errors: [
        { messageId: "upward", data: { importer: "mention-connections", imported: "assistant" } },
      ],
    },
    {
      name: "no tool-owning domain imports the Assistant domain",
      code: 'import { streamAssistantReply } from "@@/core/domains/assistant/assistant.ts";',
      filename: inDomain("story-feed/get-feed-user-summaries.tool.ts"),
      errors: [{ messageId: "upward", data: { importer: "story-feed", imported: "assistant" } }],
    },
    {
      name: "the accounts domain never imports the story feed",
      code: 'import { createStoryFeed } from "@@/core/domains/story-feed/story-feed.ts";',
      filename: inDomain("accounts/user-summary.ts"),
      errors: [{ messageId: "upward", data: { importer: "accounts", imported: "story-feed" } }],
    },
    {
      name: "the story feed still cannot import the fetch run",
      code: 'import { createReport } from "@@/core/domains/fetch-run/report.ts";',
      filename: inDomain("story-feed/story-feed.ts"),
      errors: [{ messageId: "upward", data: { importer: "story-feed", imported: "fetch-run" } }],
    },
  ],
});
