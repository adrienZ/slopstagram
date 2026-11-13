import { defineAssistantEvals } from "./assistant-cases.ts";
import { worldAccounts, worldMentionedName } from "./assistant-world.ts";

defineAssistantEvals([
  {
    name: "whether two accounts know each other",
    question: `Est-ce que @${worldAccounts.withSummary} et @${worldAccounts.withoutRecentStories} se connaissent ?`,
    expected: { tools: ["getMentionConnection"] },
  },
  {
    name: "who mentioned an account",
    question: `Qui a mentionné @${worldAccounts.withoutRecentStories} dans ses stories ?`,
    expected: { tools: ["listMentionConnections"] },
  },
  {
    name: "every mention connection",
    question: "Quelles connexions de mentions as-tu observées dans les stories ?",
    expected: { tools: ["listMentionConnections"] },
  },
  {
    name: "someone mentioned by part of a name",
    question: "Est-ce que quelqu'un a mentionné une personne qui s'appelle Friend ?",
    expected: { tools: ["searchMentionConnections"] },
  },
  {
    name: "a full name two stories carry",
    question: `Est-ce que @${worldAccounts.withSummary} et ${worldMentionedName} se connaissent ?`,
    expected: { tools: ["getMentionConnection"] },
  },
  {
    name: "two people no story connects",
    question: `Est-ce que @${worldAccounts.withoutRecentStories} et @${worldAccounts.unknown} se connaissent ?`,
    expected: { tools: ["getMentionConnection"] },
  },
]);
