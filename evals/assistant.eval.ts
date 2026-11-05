import { evalite } from "evalite";
import { afterAll } from "vitest";
import { createAssistantJudge } from "./assistant-judge.ts";
import {
  createAssistantChecks,
  type AssistantExpectation,
  type AssistantRun,
} from "./assistant-scorers.ts";
import { askAssistant, savedUsernames, worldAccounts } from "./assistant-world.ts";

/** Every case runs this many times: the chat model is not deterministic. */
const TRIALS = 5;

interface AssistantCase {
  name: string;
  question: string;
  expected: Omit<AssistantExpectation, "savedUsernames">;
}

const cases: Array<AssistantCase> = [
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
    name: "saved accounts",
    question: "Quels comptes sont enregistrés ?",
    expected: { tools: ["listAccounts"] },
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
  {
    name: "account name matching no saved account",
    question: "Est-ce qu'on suit quelqu'un qui s'appelle Zelda ?",
    expected: { tools: ["searchAccounts"] },
  },
  {
    name: "greeting",
    question: "Bonjour !",
    expected: { tools: [] },
  },
];

function describeToolCalls(run: AssistantRun): string {
  return run.toolCalls.length === 0
    ? "none"
    : run.toolCalls
        .map(({ input, toolName }) => `${toolName}(${JSON.stringify(input)})`)
        .join(", ");
}

const judge = createAssistantJudge();

for (const assistantCase of cases) {
  const expected: AssistantExpectation = { ...assistantCase.expected, savedUsernames };
  const checks = createAssistantChecks(expected);
  evalite<string, AssistantRun, AssistantExpectation>(`Assistant: ${assistantCase.name}`, {
    data: [{ expected, input: assistantCase.question }],
    task: askAssistant,
    trialCount: TRIALS,
    scorers: [
      ...checks.map(({ check, description, name }) => ({
        description,
        name,
        scorer: async ({ output }: { output: AssistantRun }) => await check(output),
      })),
      ...(judge === null ? [] : [judge.scorer]),
    ],
    columns: ({ input, output }) => [
      { label: "Question", value: input },
      { label: "Tools", value: describeToolCalls(output) },
      { label: "Answer", value: output.errorText ?? output.text },
    ],
  });
}

afterAll(() => {
  judge?.close();
});
