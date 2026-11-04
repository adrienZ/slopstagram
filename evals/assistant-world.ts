import { z } from "zod";
import { JsonValueSchema } from "../core/utils/json-value.ts";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import { listSavedAccounts } from "../core/domains/accounts/saved-accounts.ts";
import type { AssistantRuntime } from "../core/domains/assistant/assistant.ts";
import {
  readFeedUserSummary,
  type FeedUserSummary,
} from "../core/domains/story-feed/feed-user-summary.ts";
import { createWorld, imageStoryPk, recordedPayloads } from "../tests/setup/report-world.ts";
import { createRecordedInstagramClient, editRecordedStories } from "../tests/setup/seed.ts";
import type { AssistantRun, AssistantToolCall } from "./assistant-scorers.ts";

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/** The accounts of the seeded world, all synthetic. */
export const worldAccounts = {
  /** Two stories in the last 24 hours, with a stored user summary. */
  withSummary: "user_072",
  /** Saved, but its only story is older than 24 hours. */
  withoutRecentStories: "user_008",
  /** No saved account has this username. */
  unknown: "user_404",
};

export const savedUsernames = [worldAccounts.withoutRecentStories, worldAccounts.withSummary];

function keepDatabaseOpen(): void {
  // The in-memory database lives as long as the eval worker.
}

function describeOutcome(read: FeedUserSummary): string {
  if (read.status === "missing") {
    return read.reason;
  }
  return read.status === "error" ? read.error : read.status;
}

/** Fails when the seeded world no longer gives the outcomes the cases rely on, so a case measures the model and not a seeding change. */
function checkPremises(runtime: AssistantRuntime, now: Date) {
  const seeded = JSON.stringify({
    outcomes: Object.values(worldAccounts).map((username) =>
      describeOutcome(readFeedUserSummary(runtime, username, now)),
    ),
    saved: listSavedAccounts(runtime).map(({ username }) => username),
  });
  const expected = JSON.stringify({
    outcomes: ["found", "no_stories_in_last_24h", "unknown_account"],
    saved: savedUsernames,
  });
  if (seeded !== expected) {
    throw new Error(`The seeded world changed: expected ${expected}, got ${seeded}`);
  }
}

/**
 * The synthetic report world of the tests, ingested an hour after its stories were published,
 * with the story of user_008 moved a day earlier. Report creation runs with the world's fake
 * Ollama; only the chat model is real: production leaves `fetchOllama` unset, so the Ollama
 * provider uses the global fetch.
 */
async function seedAssistantWorld(): Promise<AssistantRuntime> {
  const now = new Date();
  const payloads = editRecordedStories(await recordedPayloads(), (story) => {
    if (story.pk === imageStoryPk && story.taken_at !== undefined) {
      story.taken_at -= DAY_SECONDS;
    }
  });
  const world = await createWorld(
    { onTestFinished: keepDatabaseOpen },
    {
      client: await createRecordedInstagramClient(payloads, {
        publishedBefore: { now, seconds: HOUR_SECONDS },
      }),
    },
  );
  await world.run(() => now);
  const runtime: AssistantRuntime = { ...world.runtime, fetchOllama: undefined };
  checkPremises(runtime, now);
  return runtime;
}

let world: Promise<AssistantRuntime> | undefined;

const ChunkSchema = z.looseObject({ type: z.string() });

const KnownChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text-delta"), delta: z.string() }),
  z.object({
    type: z.literal("tool-input-available"),
    toolCallId: z.string(),
    toolName: z.string(),
    input: JsonValueSchema,
  }),
  z.object({
    type: z.literal("tool-input-error"),
    toolCallId: z.string(),
    toolName: z.string(),
    input: JsonValueSchema,
    errorText: z.string(),
  }),
  z.object({
    type: z.literal("tool-output-available"),
    toolCallId: z.string(),
    output: JsonValueSchema,
  }),
  z.object({ type: z.literal("tool-output-error"), toolCallId: z.string(), errorText: z.string() }),
  z.object({ type: z.literal("error"), errorText: z.string() }),
]);

/** The body of a streamed response, up to where the stream broke when it did. */
async function readStream(response: Response): Promise<{ body: string; brokenBy?: string }> {
  let body = "";
  try {
    for await (const text of response.body?.pipeThrough(new globalThis.TextDecoderStream()) ?? []) {
      body += text;
    }
  } catch (error) {
    return { body, brokenBy: error instanceof Error ? error.message : String(error) };
  }
  return { body };
}

function parseEvent(event: string) {
  const data = event.replace(/^data: /u, "").trim();
  if (data.length === 0 || data === "[DONE]") {
    return [];
  }
  try {
    const known = KnownChunkSchema.safeParse(ChunkSchema.parse(JSON.parse(data)));
    return known.success ? [known.data] : [];
  } catch {
    // The last event of a broken stream can be cut short.
    return [];
  }
}

/** The known chunks of a UI message stream response, in order; the others are left out. */
async function readChunks(response: Response) {
  const { body, brokenBy } = await readStream(response);
  const chunks = body.split("\n\n").flatMap(parseEvent);
  return brokenBy === undefined
    ? chunks
    : [...chunks, { errorText: `The chat stream broke: ${brokenBy}`, type: "error" as const }];
}

/** Asks the Assistant one question through the chat route handler, as the chat page does. */
export async function askAssistant(question: string): Promise<AssistantRun> {
  world ??= seedAssistantWorld();
  const response = await handleChatRequest(
    await world,
    new globalThis.Request("http://localhost/api/chat", {
      body: JSON.stringify({
        messages: [{ id: "message-1", parts: [{ text: question, type: "text" }], role: "user" }],
      }),
      method: "POST",
    }),
  );
  if (!response.ok) {
    throw new Error(`The chat route answered ${response.status}: ${await response.text()}`);
  }
  const calls = new Map<string, AssistantToolCall>();
  const run: AssistantRun = { question, text: "", toolCalls: [] };
  for (const chunk of await readChunks(response)) {
    switch (chunk.type) {
      case "text-delta": {
        run.text += chunk.delta;
        break;
      }
      case "tool-input-available":
      case "tool-input-error": {
        const call: AssistantToolCall = { input: chunk.input, toolName: chunk.toolName };
        if (chunk.type === "tool-input-error") {
          call.errorText = chunk.errorText;
        }
        calls.set(chunk.toolCallId, call);
        run.toolCalls.push(call);
        break;
      }
      case "tool-output-available": {
        const call = calls.get(chunk.toolCallId);
        if (call !== undefined) {
          call.output = chunk.output;
        }
        break;
      }
      case "tool-output-error": {
        const call = calls.get(chunk.toolCallId);
        if (call !== undefined) {
          call.errorText = chunk.errorText;
        }
        break;
      }
      case "error": {
        run.errorText = chunk.errorText;
        break;
      }
      default: {
        break;
      }
    }
  }
  return run;
}
