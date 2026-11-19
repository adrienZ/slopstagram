import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { JsonValueSchema } from "../core/utils/json-value.ts";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import { listAccounts } from "../core/domains/accounts/accounts.ts";
import type { AssistantRuntime, AssistantUIMessage } from "../core/domains/assistant/assistant.ts";
import {
  getMentionConnection,
  listMentionConnections,
} from "../core/domains/mention-connections/mention-connection-reads.ts";
import { listTaggedPlaces } from "../core/domains/places/tagged-places.ts";
import { readFeedUserSummariesByUsername } from "../core/domains/story-feed/feed-user-summary.ts";
import {
  createWorld,
  imageStoryPk,
  musicStoryPk,
  placeId,
  plainStoryPk,
  recordedPayloads,
} from "../tests/setup/report-world.ts";
import {
  createRecordedInstagramClient,
  addRecordedReels,
  editRecordedStories,
  mentionStickers,
} from "../tests/setup/seed.ts";
import { traceModel } from "./assistant-trace.ts";
import { describeOutcome, type AssistantRun, type AssistantToolCall } from "./assistant-scorers.ts";

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const worldAccounts = {
  withSummary: "user_072",
  withoutRecentStories: "user_008",
  unknown: "user_404",
  withoutConnections: "user_016",
};

export const worldPlace = { id: `instagram:${placeId}`, name: "Synthetic Cafe" };

export const savedUsernames = [
  worldAccounts.withoutRecentStories,
  worldAccounts.withoutConnections,
  worldAccounts.withSummary,
];

const unconnectedStoryPk = "700000000000970";

/** A full name two stories' mention stickers carry without a username: two people, not one. */
export const worldMentionedName = "Synthetic Friend";

/**
 * The mention stickers of the seeded world: user_072 mentions user_008 on both its stories, and
 * user_008 mentions user_072 back; each of them also names Synthetic Friend once.
 */
const worldMentions = new Map([
  [
    plainStoryPk,
    mentionStickers([
      { username: worldAccounts.withoutRecentStories },
      { full_name: worldMentionedName },
    ]),
  ],
  [musicStoryPk, mentionStickers([{ username: worldAccounts.withoutRecentStories }])],
  [
    imageStoryPk,
    mentionStickers([{ username: worldAccounts.withSummary }, { full_name: worldMentionedName }]),
  ],
]);

function keepDatabaseOpen(): void {
  // The in-memory database lives as long as the eval worker.
}

function describeMentionConnections(runtime: AssistantRuntime): Array<string> {
  const list = listMentionConnections(runtime);

  return list.status === "listed"
    ? list.connections.map(({ people, storyCount }) =>
        [...people.map(({ label }) => label), storyCount].join(" "),
      )
    : [];
}

/** Fails when the seeded world no longer gives the outcomes the cases rely on, so a case measures the model and not a seeding change. */
function checkPremises(runtime: AssistantRuntime, now: Date) {
  const seeded = JSON.stringify({
    outcomes: readFeedUserSummariesByUsername(runtime, Object.values(worldAccounts), now).map(
      ({ outcome }) => describeOutcome(outcome),
    ),
    saved: listAccounts(runtime).map(({ username }) => username),
    places: listTaggedPlaces(runtime).places.map(({ id, name }) => ({ id, name })),
    mentions: describeMentionConnections(runtime),
    unconnected: getMentionConnection(runtime, {
      firstPerson: worldAccounts.withoutRecentStories,
      secondPerson: worldAccounts.withoutConnections,
    }).status,
  });

  const expected = JSON.stringify({
    outcomes: ["found", "no_stories_in_last_24h", "unknown_account", "no_stories_in_last_24h"],
    saved: savedUsernames,
    places: [worldPlace],
    mentions: [
      "@user_008 @user_072 3",
      `@user_072 ${worldMentionedName} 1`,
      `@user_008 ${worldMentionedName} 1`,
    ],
    unconnected: "no_observation",
  });

  if (seeded !== expected) {
    throw new Error(`The seeded world changed: expected ${expected}, got ${seeded}`);
  }
}

/** Only the chat model is real; report creation runs on the world's fake Ollama. */
export async function seedAssistantWorld(): Promise<AssistantRuntime> {
  const now = new Date();

  const recorded = addRecordedReels(await recordedPayloads(), [
    {
      userPk: "700000000000969",
      username: worldAccounts.withoutConnections,
      storyPk: unconnectedStoryPk,
    },
  ]);

  const payloads = editRecordedStories(recorded, (story) => {
    if (
      (story.pk === imageStoryPk || story.pk === unconnectedStoryPk) &&
      story.taken_at !== undefined
    ) {
      story.taken_at -= DAY_SECONDS;
    }

    if (story.pk === unconnectedStoryPk) {
      story.story_locations = [];
    }

    story.story_bloks_stickers = worldMentions.get(story.pk) ?? [];
  });

  const world = await createWorld(
    { onTestFinished: keepDatabaseOpen },
    {
      client: await createRecordedInstagramClient(payloads, {
        publishedBefore: { now, seconds: HOUR_SECONDS },
      }),
    },
  );

  await world.run();

  const runtime: AssistantRuntime = {
    ...world.runtime,
    fetchOllama: globalThis.fetch,
    wrapModel: traceModel,
  };

  checkPremises(runtime, now);

  return runtime;
}

let world: Promise<AssistantRuntime> | undefined;

/** The chat page's own `DefaultChatTransport`, pointed at the route handler instead of the network. */
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

/** The local chat model answers one request at a time; more would queue in Ollama and time out. */
export async function askAssistant(question: string): Promise<AssistantRun> {
  const run = afterPrevious(lastQuestion, async () => await answer(question));
  lastQuestion = run;

  return await run;
}
