import { z } from "zod";
import type { FeedUserSummary } from "../core/domains/story-feed/feed-user-summary.ts";
import { FeedUserSummaryOutputSchema } from "../core/domains/story-feed/feed-user-summary.tool.ts";
import type { JsonObject, JsonValue } from "../core/utils/json-value.ts";

/** One tool call of an Assistant reply, as the chat stream showed it. */
export interface AssistantToolCall {
  toolName: string;
  input: JsonValue;
  output?: JsonValue;
  errorText?: string;
}

/** What the Assistant streamed for one question. */
export interface AssistantRun {
  question: string;
  toolCalls: Array<AssistantToolCall>;
  text: string;
  /** The stream's error, when the chat model failed. */
  errorText?: string;
}

/** How a getFeedUserSummary call ended: "found", the reason of a missing summary, or the error. */
export type FeedUserSummaryOutcome =
  | "found"
  | Extract<FeedUserSummary, { status: "missing" }>["reason"]
  | Extract<FeedUserSummary, { status: "error" }>["error"];

/** The outcome of a read of the user summary of one account. */
export function describeOutcome(read: FeedUserSummary): FeedUserSummaryOutcome {
  if (read.status === "missing") {
    return read.reason;
  }
  return read.status === "error" ? read.error : read.status;
}

/** What a case expects from the Assistant. */
export interface AssistantExpectation {
  /** The tool the Assistant should call, or null when it should answer without a tool. */
  tool: "getFeedUserSummary" | "listAccounts" | null;
  /** The username the tool should be called with. */
  username?: string;
  /** The outcome every getFeedUserSummary result should have. */
  outcome?: FeedUserSummaryOutcome;
  /** The saved accounts of the seeded world: the only usernames an answer may name. */
  savedUsernames: Array<string>;
}

interface CheckResult {
  score: 0 | 1;
  metadata?: JsonObject;
}

/** A deterministic scorer of one Assistant run. */
export interface AssistantCheck {
  name: string;
  description: string;
  check: (run: AssistantRun) => CheckResult;
}

function result(passed: boolean, metadata?: JsonObject): CheckResult {
  return { metadata, score: passed ? 1 : 0 };
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/u, "").toLowerCase();
}

const UsernameInputSchema = z.object({ username: z.string() });

// An @mention, without the punctuation that may end a sentence after it.
const MENTION = /@(?<username>[\w.]*\w)/gu;
// The seeded world names every account user_<digits>, so an invented one shows up in this shape too.
const SYNTHETIC_USERNAME = /\buser_\d+\b/giu;

/** The usernames a text names, as @mentions or in the seeded world's username shape, lowercased. */
function findUsernames(text: string): Array<string> {
  const mentioned = [...text.matchAll(MENTION)].map((match) => match.groups?.username ?? "");
  const bare = [...text.matchAll(SYNTHETIC_USERNAME)].map(([username]) => username);
  return [...new Set([...mentioned, ...bare].map(normalizeUsername))];
}

// Common words of short French and English answers. Words both languages use ("a", "on") are left out.
const FRENCH_WORDS = new Set([
  "au",
  "aucun",
  "aucune",
  "aux",
  "bonjour",
  "ce",
  "ces",
  "cette",
  "compte",
  "comptes",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "est",
  "et",
  "il",
  "je",
  "la",
  "le",
  "les",
  "mais",
  "ne",
  "nous",
  "ou",
  "pas",
  "pour",
  "qui",
  "que",
  "salut",
  "sont",
  "sur",
  "un",
  "une",
  "vous",
]);

const ENGLISH_WORDS = new Set([
  "account",
  "accounts",
  "and",
  "any",
  "are",
  "can",
  "for",
  "has",
  "have",
  "hello",
  "help",
  "hi",
  "hours",
  "is",
  "it",
  "last",
  "no",
  "not",
  "of",
  "posted",
  "the",
  "this",
  "that",
  "to",
  "was",
  "which",
  "with",
  "you",
  "your",
]);

const FRENCH_LETTERS = /[àâæçéèêëîïôœùûüÿ]/u;

/** Whether a text reads as French rather than English, from its common words and accents. */
function isFrench(text: string): boolean {
  const words = text.toLowerCase().split(/[^\p{L}]+/u);
  const french = words.filter((word) => FRENCH_WORDS.has(word) || FRENCH_LETTERS.test(word));
  const english = words.filter((word) => ENGLISH_WORDS.has(word));
  return french.length > english.length;
}

function describeCalls(run: AssistantRun) {
  return run.toolCalls.map(({ input, toolName }) => ({ input, toolName }));
}

function expectedTool(expected: AssistantExpectation): AssistantCheck {
  return {
    name: "Expected tool",
    description:
      expected.tool === null
        ? "The Assistant called no tool."
        : `The Assistant called ${expected.tool}, and no other tool.`,
    check: (run) => {
      const names = run.toolCalls.map(({ toolName }) => toolName);
      const passed =
        expected.tool === null
          ? names.length === 0
          : names.length > 0 && names.every((name) => name === expected.tool);
      return result(passed, { calls: describeCalls(run) });
    },
  };
}

function expectedArguments(username: string): AssistantCheck {
  return {
    name: "Expected arguments",
    description: `Every getFeedUserSummary call asked for ${username} (an "@" prefix and letter case ignored, as the tool does).`,
    check: (run) => {
      const calls = run.toolCalls.filter(({ toolName }) => toolName === "getFeedUserSummary");
      const usernames = calls.map(
        ({ input }) => UsernameInputSchema.safeParse(input).data?.username ?? null,
      );
      const passed =
        usernames.length > 0 &&
        usernames.every(
          (called) => called !== null && normalizeUsername(called) === normalizeUsername(username),
        );
      return result(passed, { usernames });
    },
  };
}

function expectedOutcome(outcome: FeedUserSummaryOutcome): AssistantCheck {
  return {
    name: "Expected outcome",
    description: `Every getFeedUserSummary call returned ${outcome}, as the stream showed its result.`,
    check: (run) => {
      const outcomes = run.toolCalls
        .filter(({ toolName }) => toolName === "getFeedUserSummary")
        .map(({ output }) => {
          const read = FeedUserSummaryOutputSchema.safeParse(output);
          return read.success ? describeOutcome(read.data) : null;
        });
      const passed = outcomes.length > 0 && outcomes.every((seen) => seen === outcome);
      return result(passed, { outcomes });
    },
  };
}

function knownUsernames(expected: AssistantExpectation): AssistantCheck {
  return {
    name: "No invented account",
    description:
      "The answer names no username outside the saved accounts and the ones the question mentions.",
    check: (run) => {
      const known = new Set([
        ...expected.savedUsernames.map(normalizeUsername),
        ...findUsernames(run.question),
      ]);
      const invented = findUsernames(run.text).filter((username) => !known.has(username));
      return result(invented.length === 0, { invented });
    },
  };
}

const nonEmptyAnswer: AssistantCheck = {
  name: "Non-empty answer",
  description: "The Assistant streamed an answer, and no error.",
  check: (run) =>
    result(run.text.trim().length > 0 && run.errorText === undefined, {
      errorText: run.errorText ?? null,
    }),
};

const frenchAnswer: AssistantCheck = {
  name: "Answer in French",
  description: "The answer is written in French, the language of the question.",
  check: (run) => result(isFrench(run.text)),
};

/** The deterministic scorers of a case: every one must pass for a run to pass. */
export function createAssistantChecks(expected: AssistantExpectation): Array<AssistantCheck> {
  return [
    expectedTool(expected),
    ...(expected.username === undefined ? [] : [expectedArguments(expected.username)]),
    ...(expected.outcome === undefined ? [] : [expectedOutcome(expected.outcome)]),
    knownUsernames(expected),
    nonEmptyAnswer,
    frenchAnswer,
  ];
}
