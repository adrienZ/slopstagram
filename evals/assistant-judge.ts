import { accessSync, constants, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { generateText, Output } from "ai";
import { codexCli } from "ai-sdk-provider-codex-cli";
import type { Evalite } from "evalite";
import { wrapAISDKModel } from "evalite/ai-sdk";
import { z } from "zod";
import type { AssistantExpectation, AssistantRun } from "./assistant-scorers.ts";

/** The cheapest model `codex debug models` lists: the judge only grades short synthetic answers. */
const JUDGE_MODEL = "gpt-6-luna";

const VerdictSchema = z.object({
  faithful: z
    .boolean()
    .describe(
      "Every fact the answer states about an account comes from the tool results. With no tool result, the answer states no fact about any account. A mention is an observed author-to-target reference, never proof of acquaintance; missing observations never prove people do not know each other. Historical username identity is approximate and distinct name-only matches require clarification.",
    ),
  answersQuestion: z
    .boolean()
    .describe(
      "The answer addresses the question, including saying plainly when the account is unknown, has no story in the last 24 hours or has no summary yet.",
    ),
  writtenInFrench: z.boolean().describe("The answer is written in French."),
  score: z.number().min(0).max(1).describe("The overall quality of the answer, from 0 to 1."),
});

function findOnPath(command: string): string | null {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory.
    }
  }
  return null;
}

function judgePrompt(run: AssistantRun): string {
  return `You grade one reply of the Assistant of Slopstagram, a chat assistant that answers questions about saved Instagram accounts from the results of its tools only. All the data below is synthetic.
Grade from the text below only. Do not run commands, read files or browse the web.

Question of the user:
${run.question}

Tool results the Assistant received, as JSON:
${JSON.stringify(run.toolCalls.map(({ output, toolName }) => ({ output, toolName })))}

Answer of the Assistant:
${run.text}`;
}

export interface AssistantJudge {
  scorer: Evalite.ScorerOpts<string, AssistantRun, AssistantExpectation>;
  close: () => void;
}

/**
 * The optional LLM judge: the Codex CLI as an AI SDK provider, running `JUDGE_MODEL`. Null, so
 * the judge is skipped, when `codex` is not on the PATH or on CI (the runners have `codex` but no login). Codex runs in an empty temporary directory with a read-only sandbox and
 * never approves an action, so it sees only the synthetic run it grades.
 */
export function createAssistantJudge(): AssistantJudge | null {
  const codexPath = findOnPath("codex");
  if (codexPath === null || process.env.CI !== undefined) {
    return null;
  }
  const workspace = mkdtempSync(path.join(tmpdir(), "slopstagram-judge-"));
  const model = wrapAISDKModel(
    codexCli(JUDGE_MODEL, {
      approvalMode: "never",
      codexPath,
      cwd: workspace,
      reasoningEffort: "medium",
      sandboxMode: "read-only",
      skipGitRepoCheck: true,
    }),
  );
  return {
    close: () => {
      rmSync(workspace, { force: true, recursive: true });
    },
    scorer: {
      name: "Judge",
      description: `${JUDGE_MODEL} grades faithfulness, relevance and language.`,
      scorer: async ({ output: run }) => {
        const { output: verdict } = await generateText({
          model,
          output: Output.object({ schema: VerdictSchema }),
          prompt: judgePrompt(run),
        });
        return { metadata: verdict, score: verdict.score };
      },
    },
  };
}
