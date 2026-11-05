import { describe, expect, test } from "vitest";
import {
  createAssistantChecks,
  type AssistantExpectation,
  type AssistantRun,
} from "../evals/assistant-scorers.ts";
import type { JsonValue } from "../core/utils/json-value.ts";

const savedUsernames = ["user_008", "user_072"];

function score(expected: Omit<AssistantExpectation, "savedUsernames">, run: Partial<AssistantRun>) {
  const full: AssistantRun = { question: "", text: "", toolCalls: [], ...run };
  return Object.fromEntries(
    createAssistantChecks({ ...expected, savedUsernames }).map(({ check, name }) => [
      name,
      check(full).score,
    ]),
  );
}

const found = {
  status: "found",
  storyCount: 2,
  summary: "Summary of user_072",
  username: "user_072",
};

/** A getFeedUserSummaries call, whose output lists one read per username asked. */
function summaryCall(username: string, outcome: JsonValue = found) {
  return {
    input: { usernames: [username] },
    output: [{ handle: `@${username}`, outcome, requestedUsername: username }],
    toolName: "getFeedUserSummaries",
  };
}

describe("the deterministic scorers of the Assistant evals", () => {
  test("a run calling the expected tool with the mentioned username, answered in French, passes every scorer", () => {
    expect(
      score(
        { outcome: "found", tool: "getFeedUserSummaries", username: "user_072" },
        {
          question: "Qu'a publié @user_072 ces dernières 24 heures ?",
          text: "@user_072 a publié deux stories : un résumé de user_072.",
          toolCalls: [summaryCall("@User_072")],
        },
      ),
    ).toStrictEqual({
      "Answer in French": 1,
      "Expected arguments": 1,
      "Expected outcome": 1,
      "Expected tool": 1,
      "No invented account": 1,
      "Non-empty answer": 1,
    });
  });

  test("the outcome scorer passes only when every getFeedUserSummaries result has the expected status and reason", () => {
    function outcome(expected: "no_stories_in_last_24h" | "unknown_account", output?: JsonValue) {
      return score(
        { outcome: expected, tool: "getFeedUserSummaries", username: "user_404" },
        { toolCalls: output === undefined ? [] : [summaryCall("user_404", output)] },
      )["Expected outcome"];
    }
    const unknown = { error: "unknown_account", status: "error" };
    const noStories = { reason: "no_stories_in_last_24h", status: "missing", username: "user_008" };
    const notGenerated = { reason: "not_generated", status: "missing", username: "user_008" };

    expect(outcome("unknown_account", unknown)).toBe(1);
    expect(outcome("unknown_account", found)).toBe(0);
    expect(outcome("unknown_account")).toBe(0);
    expect(outcome("no_stories_in_last_24h", noStories)).toBe(1);
    expect(outcome("no_stories_in_last_24h", notGenerated)).toBe(0);
    expect(outcome("no_stories_in_last_24h", "not a tool result")).toBe(0);
    expect(
      score(
        { outcome: "unknown_account", tool: "getFeedUserSummaries", username: "user_404" },
        {
          // The second call failed: the stream showed no result for it.
          toolCalls: [
            summaryCall("user_404", unknown),
            {
              errorText: "The tool failed.",
              input: { usernames: ["user_404"] },
              toolName: "getFeedUserSummaries",
            },
          ],
        },
      )["Expected outcome"],
    ).toBe(0);
  });

  test("another tool, another username, an invented account and an English answer each fail their scorer", () => {
    expect(
      score(
        { tool: "getFeedUserSummaries", username: "user_072" },
        {
          question: "Qu'a publié @user_072 ?",
          text: "The account user_123 posted a story, and @someone_else liked it.",
          toolCalls: [summaryCall("user_008"), { input: {}, toolName: "listAccounts" }],
        },
      ),
    ).toStrictEqual({
      "Answer in French": 0,
      "Expected arguments": 0,
      "Expected tool": 0,
      "No invented account": 0,
      "Non-empty answer": 1,
    });
  });

  test("an unknown account mentioned by the question may be named in the answer", () => {
    expect(
      score(
        { tool: "getFeedUserSummaries", username: "user_404" },
        {
          question: "Et @user_404 ?",
          text: "Le compte @user_404 est inconnu.",
          toolCalls: [summaryCall("user_404")],
        },
      )["No invented account"],
    ).toBe(1);
  });

  test("a greeting passes only without a tool call, and a failed or empty answer fails", () => {
    expect(score({ tool: null }, { text: "Bonjour ! Que voulez-vous savoir ?" })).toStrictEqual({
      "Answer in French": 1,
      "Expected tool": 1,
      "No invented account": 1,
      "Non-empty answer": 1,
    });
    expect(
      score(
        { tool: null },
        { text: "Bonjour", toolCalls: [{ input: {}, toolName: "listAccounts" }] },
      )["Expected tool"],
    ).toBe(0);
    expect(score({ tool: null }, { text: "  " })["Non-empty answer"]).toBe(0);
    expect(
      score({ tool: null }, { errorText: "The chat model did not answer.", text: "Bonjour" })[
        "Non-empty answer"
      ],
    ).toBe(0);
  });
});
