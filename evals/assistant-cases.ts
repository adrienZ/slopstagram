import { evalite } from "evalite";
import { afterAll } from "vitest";
import { createAssistantJudge } from "./assistant-judge.ts";
import {
  createAssistantChecks,
  type AssistantExpectation,
  type AssistantRun,
} from "./assistant-scorers.ts";
import { askAssistant, savedUsernames } from "./assistant-world.ts";

/** Every case runs this many times: the chat model is not deterministic. */
const TRIALS = 5;

/** One question to the Assistant and what its answer should show. */
export interface AssistantCase {
  name: string;
  question: string;
  expected: Omit<AssistantExpectation, "savedUsernames">;
}

function describeToolCalls(run: AssistantRun): string {
  return run.toolCalls.length === 0
    ? "none"
    : run.toolCalls
        .map(({ input, toolName }) => `${toolName}(${JSON.stringify(input)})`)
        .join(", ");
}

/** Declares one eval per case of an eval file, each scored by the checks and the judge. */
export function defineAssistantEvals(cases: Array<AssistantCase>): void {
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
}
