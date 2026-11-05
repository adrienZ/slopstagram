import process from "node:process";
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
  /** The share of runs that must pass every deterministic scorer. */
  passRateThreshold: number;
}

/**
 * 3 runs out of 5: the baseline of the default chat model (qwen3.5:0.8b), which does not pass
 * every run. The suite measures that model and catches regressions from prompt, tool description
 * or model changes; it does not demand perfection. Raise it when the model improves.
 */
const BASELINE_PASS_RATE = 0.6;

const cases: Array<AssistantCase> = [
  {
    name: "last 24 hours of a mentioned account",
    question: `Qu'a publié @${worldAccounts.withSummary} ces dernières 24 heures ?`,
    expected: {
      outcome: "found",
      tool: "getFeedUserSummaries",
      username: worldAccounts.withSummary,
    },
    passRateThreshold: BASELINE_PASS_RATE,
  },
  {
    name: "saved accounts",
    question: "Quels comptes sont enregistrés ?",
    expected: { tool: "listAccounts" },
    passRateThreshold: BASELINE_PASS_RATE,
  },
  {
    name: "unknown account",
    question: `Qu'a publié @${worldAccounts.unknown} ces dernières 24 heures ?`,
    expected: {
      outcome: "unknown_account",
      tool: "getFeedUserSummaries",
      username: worldAccounts.unknown,
    },
    passRateThreshold: BASELINE_PASS_RATE,
  },
  {
    name: "account without stories in the last 24 hours",
    question: `Qu'a fait @${worldAccounts.withoutRecentStories} aujourd'hui ?`,
    expected: {
      outcome: "no_stories_in_last_24h",
      tool: "getFeedUserSummaries",
      username: worldAccounts.withoutRecentStories,
    },
    passRateThreshold: BASELINE_PASS_RATE,
  },
  {
    name: "greeting",
    question: "Bonjour !",
    expected: { tool: null },
    passRateThreshold: BASELINE_PASS_RATE,
  },
];

const judge = createAssistantJudge();
/** The names of the deterministic scorers each run of a case passed, by case name. */
const passes = new Map<string, Array<Array<string>>>(cases.map(({ name }) => [name, []]));

function describeToolCalls(run: AssistantRun): string {
  return run.toolCalls.length === 0
    ? "none"
    : run.toolCalls
        .map(({ input, toolName }) => `${toolName}(${JSON.stringify(input)})`)
        .join(", ");
}

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
        scorer: ({ output }: { output: AssistantRun }) => check(output),
      })),
      {
        name: "Passed",
        description: "Every deterministic scorer passed: the case's pass rate counts these runs.",
        scorer: ({ output }) => {
          const passed = checks.filter(({ check }) => check(output).score === 1);
          passes.get(assistantCase.name)?.push(passed.map(({ name }) => name));
          return passed.length === checks.length ? 1 : 0;
        },
      },
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
  const rates = cases.map(({ expected, name, passRateThreshold }) => {
    const checkNames = createAssistantChecks({ ...expected, savedUsernames }).map(
      (check) => check.name,
    );
    const runs = passes.get(name) ?? [];
    const perCheck = checkNames.map(
      (checkName) =>
        `${checkName} ${runs.filter((passed) => passed.includes(checkName)).length}/${TRIALS}`,
    );
    return {
      // A run that failed before its scorers counts as failed.
      passed: runs.filter((passed) => passed.length === checkNames.length).length,
      perCheck,
      name,
      required: Math.ceil(passRateThreshold * TRIALS),
    };
  });
  const lines = rates.map(
    ({ name, passed, perCheck, required }) =>
      `${passed >= required ? "pass" : "FAIL"}  ${name}: ${passed}/${TRIALS} runs passed (threshold ${required}/${TRIALS})\n      ${perCheck.join(", ")}`,
  );
  const judged = judge === null ? "skipped (set EVAL_JUDGE_MODEL and install codex)" : "on";
  process.stdout.write(
    `\nAssistant pass rate per case\n${lines.join("\n")}\nLLM judge: ${judged}\n\n`,
  );
  const failing = rates.filter(({ passed, required }) => passed < required);
  if (failing.length > 0) {
    throw new Error(`Below the pass-rate threshold: ${failing.map(({ name }) => name).join(", ")}`);
  }
});
