import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { JsonValueSchema } from "../core/utils/json-value.ts";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import { listAccounts } from "../core/domains/accounts/accounts.ts";
import type { AssistantRuntime, AssistantUIMessage } from "../core/domains/assistant/assistant.ts";
import { listTaggedPlaces } from "../core/domains/places/tagged-places.ts";
import { readFeedUserSummary } from "../core/domains/story-feed/feed-user-summary.ts";
import {
  createWorld,
  imageStoryPk,
  plainStoryPk,
  placeId,
  recordedPayloads,
} from "../tests/setup/report-world.ts";
import { createRecordedInstagramClient, editRecordedStories } from "../tests/setup/seed.ts";
import { traceModel } from "./assistant-trace.ts";
import { describeOutcome, type AssistantRun, type AssistantToolCall } from "./assistant-scorers.ts";

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

/** The one Tagged place of the seeded world, tagged by user_008. */
export const worldPlace = { id: `instagram:${placeId}`, name: "Synthetic Cafe" };

/** Synthetic identities used only by the mention-connection evaluations. */
export const worldMention = {
  unknown: "synthetic_guest",
  ambiguousName: "Synthetic Guest",
};

export const savedUsernames = [worldAccounts.withoutRecentStories, worldAccounts.withSummary];

function keepDatabaseOpen(): void {
  // The in-memory database lives as long as the eval worker.
}

/** Fails when the seeded world no longer gives the outcomes the cases rely on, so a case measures the model and not a seeding change. */
function checkPremises(runtime: AssistantRuntime, now: Date) {
  const seeded = JSON.stringify({
    outcomes: Object.values(worldAccounts).map((username) =>
      describeOutcome(readFeedUserSummary(runtime, username, now)),
    ),
    saved: listAccounts(runtime).map(({ username }) => username),
    places: listTaggedPlaces(runtime).places.map(({ id, name }) => ({ id, name })),
  });
  const expected = JSON.stringify({
    outcomes: ["found", "no_stories_in_last_24h", "unknown_account"],
    saved: savedUsernames,
    places: [worldPlace],
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
    const username = story.pk === imageStoryPk ? "user_072" : "user_008";
    story.story_bloks_stickers = [
      { bloks_sticker: { sticker_data: { ig_mention: { username } } } },
    ];
    if (story.pk === plainStoryPk) {
      story.story_bloks_stickers = [username, worldMention.unknown].map((mentioned) => ({
        bloks_sticker: { sticker_data: { ig_mention: { username: mentioned } } },
      }));
    }
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
  const runtime: AssistantRuntime = {
    ...world.runtime,
    fetchOllama: undefined,
    wrapModel: traceModel,
  };
  checkPremises(runtime, now);
  // Recordings have no name-only labels, so use the real repositories.
  await Promise.all(
    ["synthetic-name-1", "synthetic-name-2"].map(async (pk) => {
      await world.runtime.stories.save(
        {
          pk,
          taken_at: Math.floor(now.getTime() / 1000) - 2 * DAY_SECONDS,
          annotations: {
            locations: [],
            stickers: [{ kind: "mention", label: worldMention.ambiguousName }],
          },
        },
        { pk: "700000000000001", username: "user_008" },
      );
    }),
  );
  return runtime;
}

let world: Promise<AssistantRuntime> | undefined;

/**
 * Asks the Assistant one question as the chat page does: the same `DefaultChatTransport` client,
 * whose requests go to the chat route handler instead of the network.
 */
async function answer(question: string): Promise<AssistantRun> {
  world ??= seedAssistantWorld();
  const runtime = await world;
  const chat = new Chat<AssistantUIMessage>({
    transport: new DefaultChatTransport<AssistantUIMessage>({
      api: "http://localhost/api/chat",
      fetch: async (input, init) =>
        await handleChatRequest(runtime, new globalThis.Request(input, init)),
    }),
  });
  await chat.sendMessage({ text: question });
  const run: AssistantRun = { question, text: "", toolCalls: [] };
  // The client keeps a stream error, or a failed request, in `error` instead of throwing.
  if (chat.error !== undefined) {
    run.errorText = chat.error.message;
  }
  // Without a reply (a failed request) the last message is still the question.
  const reply = chat.lastMessage?.role === "assistant" ? chat.lastMessage : undefined;
  for (const part of reply?.parts ?? []) {
    if (part.type === "text") {
      run.text += part.text;
    } else if (isToolUIPart(part)) {
      const call: AssistantToolCall = {
        input: JsonValueSchema.safeParse(part.input).data ?? null,
        toolName: getToolName(part),
      };
      if (part.state === "output-available") {
        call.output = JsonValueSchema.safeParse(part.output).data ?? null;
      } else if (part.state === "output-error") {
        call.errorText = part.errorText;
      }
      run.toolCalls.push(call);
    }
  }
  return run;
}

async function afterPrevious<Result>(
  previous: Promise<unknown>,
  task: () => Promise<Result>,
): Promise<Result> {
  try {
    await previous;
  } catch {
    // The previous question failed on its own: this one still runs.
  }
  return await task();
}

let lastQuestion: Promise<unknown> = Promise.resolve();

/**
 * Asks the Assistant one question at a time, in arrival order. The local chat model answers one
 * request at a time: more would only queue in Ollama and time out. The judge has no such limit, so
 * evalite runs the cases concurrently and only the chat model calls wait here.
 */
export async function askAssistant(question: string): Promise<AssistantRun> {
  const run = afterPrevious(lastQuestion, async () => await answer(question));
  lastQuestion = run;
  return await run;
}
