import { defineAssistantEvals } from "./assistant-cases.ts";
import { worldAccounts } from "./assistant-world.ts";

defineAssistantEvals([
  {
    name: "last 24 hours of a mentioned account",
    question: `Qu'a publié @${worldAccounts.withSummary} ces dernières 24 heures ?`,
    expected: {
      outcome: "found",
      tools: ["getFeedUserSummaries"],
      username: worldAccounts.withSummary,
    },
  },
  {
    name: "unknown account",
    question: `Qu'a publié @${worldAccounts.unknown} ces dernières 24 heures ?`,
    expected: {
      outcome: "unknown_account",
      tools: ["getFeedUserSummaries"],
      username: worldAccounts.unknown,
    },
  },
  {
    name: "account without stories in the last 24 hours",
    question: `Qu'a fait @${worldAccounts.withoutRecentStories} aujourd'hui ?`,
    expected: {
      outcome: "no_stories_in_last_24h",
      tools: ["getFeedUserSummaries"],
      username: worldAccounts.withoutRecentStories,
    },
  },
]);
