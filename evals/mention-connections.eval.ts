import { defineAssistantEvals } from "./assistant-cases.ts";
import { worldAccounts, worldMention } from "./assistant-world.ts";

defineAssistantEvals([
  {
    name: "list observed mention connections",
    question: "Quelles connexions par mentions sont présentes dans les stories conservées ?",
    expected: {
      tools: ["listMentionConnections"],
      observedUsernames: [worldMention.unknown],
      mentionCaution: true,
    },
  },
  {
    name: "mentions do not prove acquaintance",
    question: `Est-ce que @${worldAccounts.withSummary} et @${worldAccounts.withoutRecentStories} se connaissent ? Vérifie leurs mentions et donne les stories comme preuves.`,
    expected: {
      tools: ["searchMentionConnections", "getMentionConnection"],
      mention: {
        status: "found",
        author: worldAccounts.withSummary,
        target: worldAccounts.withoutRecentStories,
      },
      mentionCaution: true,
    },
  },
  {
    name: "unknown username mention keeps its direction",
    question: `Est-ce que @${worldAccounts.withSummary} a mentionné @${worldMention.unknown} ? Dans quelle story ?`,
    expected: {
      tools: ["searchMentionConnections", "getMentionConnection"],
      mention: { status: "found", author: worldAccounts.withSummary, target: worldMention.unknown },
      mentionCaution: true,
    },
  },
  {
    name: "absence of mentions does not disprove acquaintance",
    question: `Est-ce que @${worldAccounts.withoutRecentStories} et @${worldMention.unknown} se connaissent ? Cherche une connexion par mention.`,
    expected: {
      tools: ["searchMentionConnections", "getMentionConnection"],
      mention: { status: "no_observation" },
      mentionCaution: true,
    },
  },
  {
    name: "equal name-only labels need clarification",
    question: `Quelles connexions par mention concernent ${worldMention.ambiguousName} ?`,
    expected: {
      tools: ["searchMentionConnections"],
      clarification: true,
    },
  },
]);
