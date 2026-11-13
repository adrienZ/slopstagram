import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AssistantTools } from "@@/core/domains/assistant/assistant-tools.ts";
import type { JsonValue } from "@@/core/utils/json-value.ts";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import { chatRequest, readChunks, userMessage } from "./setup/chat-stream.ts";
import {
  assistantAnswer,
  assistantGreeting,
  assistantThinking,
  createWorld,
  now,
  placeAnswer,
  placesAnswer,
  placeId,
  plainStoryPk,
} from "./setup/report-world.ts";

beforeEach(() => {
  // The Assistant reads the story feed of the current time.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

test("a mentioned account with a stored user summary streams the tool call, its summary, then the answer", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const response = await handleChatRequest(
    world.runtime,
    chatRequest(userMessage("What did @User_072 post in the last 24 hours?")),
  );

  expect(response.status).toBe(200);
  const chunks = await readChunks(response);
  expect(chunks.toolInputs).toStrictEqual([
    { input: { usernames: ["User_072"] }, toolName: "getFeedUserSummaries" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([
    [
      {
        outcome: {
          status: "found",
          storyCount: 2,
          summary: "Summary of user_072",
          username: "user_072",
        },
        handle: "@user_072",
        requestedUsername: "User_072",
      },
    ],
  ]);
  expect(chunks.reasoning).toBe(assistantThinking);
  expect(chunks.text).toBe(assistantAnswer);
});

test("several mentioned accounts stream their summaries in the order asked", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(
      world.runtime,
      chatRequest(userMessage("Are @User_072 and @user_999 together?")),
    ),
  );

  expect(chunks.toolInputs).toStrictEqual([
    { input: { usernames: ["User_072", "user_999"] }, toolName: "getFeedUserSummaries" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([
    [
      {
        outcome: {
          status: "found",
          storyCount: 2,
          summary: "Summary of user_072",
          username: "user_072",
        },
        handle: "@user_072",
        requestedUsername: "User_072",
      },
      {
        outcome: { error: "unknown_account", status: "error" },
        handle: "@user_999",
        requestedUsername: "user_999",
      },
    ],
  ]);
  expect(chunks.text).toBe(assistantAnswer);
});

test("an unknown account streams the unknown_account outcome", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("And @user_999?"))),
  );

  expect(chunks.toolOutputs).toStrictEqual([
    [
      {
        outcome: { error: "unknown_account", status: "error" },
        handle: "@user_999",
        requestedUsername: "user_999",
      },
    ],
  ]);
  expect(chunks.text).toBe(assistantAnswer);
});

test("an account without stories in the last 24 hours streams no_stories_in_last_24h", async (context) => {
  const world = await createWorld(context);
  await world.run();
  vi.setSystemTime(new Date(now.getTime() + 24 * 3600 * 1000));

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("What about @user_008?"))),
  );

  expect(chunks.toolOutputs).toStrictEqual([
    [
      {
        outcome: { reason: "no_stories_in_last_24h", status: "missing", username: "user_008" },
        handle: "@user_008",
        requestedUsername: "user_008",
      },
    ],
  ]);
});

test("an account whose summary was not generated streams not_generated, without generating one", async (context) => {
  const world = await createWorld(context, { ollama: { summary: "server-error" } });
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("What about @user_072?"))),
  );

  expect(chunks.toolOutputs).toStrictEqual([
    [
      {
        outcome: { reason: "not_generated", status: "missing", username: "user_072" },
        handle: "@user_072",
        requestedUsername: "user_072",
      },
    ],
  ]);
  expect(
    world.ollama.requests.map(({ kind }) => kind).filter((kind) => kind !== "vision"),
  ).toStrictEqual(["summary", "summary", "chat", "chat"]);
});

test("asking which accounts there are streams the listAccounts call and every account", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("Which accounts do you know?"))),
  );

  expect(chunks.toolInputs).toStrictEqual([{ input: {}, toolName: "listAccounts" }]);
  // The world's tray carries no full names.
  expect(chunks.toolOutputs).toStrictEqual([
    {
      accounts: [
        { fullName: null, handle: "@user_008", username: "user_008" },
        { fullName: null, handle: "@user_072", username: "user_072" },
      ],
    },
  ]);
  expect(chunks.text).toBe(assistantAnswer);
});

test("searching an account by name streams the searchAccounts call and its matches", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("Search USER_07"))),
  );

  expect(chunks.toolInputs).toStrictEqual([
    { input: { query: "USER_07" }, toolName: "searchAccounts" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([
    {
      accounts: [{ fullName: null, handle: "@user_072", username: "user_072" }],
      total: 1,
    },
  ]);
  expect(chunks.text).toBe(assistantAnswer);
});

/** Tags eleven more places on a story of user_072, each with its own position. */
function tagElevenPlaces(story: { pk: string; story_locations?: JsonValue }) {
  if (story.pk === plainStoryPk) {
    story.story_locations = Array.from({ length: 11 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return {
        id: `synthetic-place-sticker-${number}`,
        location: {
          lat: 40 + index,
          lng: 3,
          name: `Synthetic place ${number}`,
          pk: `7000000000009${number}`,
        },
      };
    });
  }
}

/** One of the eleven places of user_072, as a list of places gives it. */
function elevenPlace(number: number) {
  const padded = String(number).padStart(2, "0");
  return {
    category: null,
    id: `instagram:7000000000009${padded}`,
    latestStoryDate: "2026-10-29T10:55:48.000Z",
    name: `Synthetic place ${padded}`,
    owners: ["@user_072"],
    storyCount: 1,
  };
}

/** The place of the world's recording, which the place lookup completes. */
const syntheticCafe = {
  category: "Cafe",
  id: `instagram:${placeId}`,
  latestStoryDate: "2026-10-29T02:12:50.000Z",
  name: "Synthetic Cafe",
  owners: ["@user_008"],
  storyCount: 1,
};

test("asking for the places streams the listTaggedPlaces call and its first page", async (context) => {
  const world = await createWorld(context, { editStory: tagElevenPlaces });
  await world.run();

  const firstPage = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("Which places?"))),
  );
  const lastPage = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("Which places? offset 10"))),
  );

  expect(firstPage.toolInputs).toStrictEqual([{ input: {}, toolName: "listTaggedPlaces" }]);
  expect(firstPage.toolOutputs).toStrictEqual([
    {
      nextOffset: 10,
      places: Array.from({ length: 10 }, (_, index) => elevenPlace(index + 1)),
      total: 12,
      unknownUsernames: [],
    },
  ]);
  expect(firstPage.text).toBe(
    placesAnswer(Array.from({ length: 10 }, (_, index) => elevenPlace(index + 1).name)),
  );
  expect(lastPage.toolInputs).toStrictEqual([
    { input: { offset: 10 }, toolName: "listTaggedPlaces" },
  ]);
  expect(lastPage.toolOutputs).toStrictEqual([
    { nextOffset: null, places: [elevenPlace(11), syntheticCafe], total: 12, unknownUsernames: [] },
  ]);
});

test("asking for the places of accounts keeps theirs and names the unknown ones", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(
      world.runtime,
      chatRequest(userMessage("Which places did @User_008 and @user_999 visit?")),
    ),
  );

  expect(chunks.toolInputs).toStrictEqual([
    { input: { usernames: ["User_008", "user_999"] }, toolName: "listTaggedPlaces" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([
    { nextOffset: null, places: [syntheticCafe], total: 1, unknownUsernames: ["user_999"] },
  ]);
});

test("searching a place streams the searchTaggedPlaces call and its matches, the closest first", async (context) => {
  const world = await createWorld(context, { editStory: tagElevenPlaces });
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("Search places CAFÉ"))),
  );

  expect(chunks.toolInputs).toStrictEqual([
    { input: { query: "CAFÉ" }, toolName: "searchTaggedPlaces" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([
    { nextOffset: null, places: [syntheticCafe], total: 1 },
  ]);
  expect(chunks.text).toBe(placesAnswer(["Synthetic Cafe"]));
});

test("reading a place streams the getTaggedPlace call, its details, then an answer linking it", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const found = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage(`Place instagram:${placeId}`))),
  );
  const unknown = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("Place instagram:999"))),
  );

  expect(found.toolInputs).toStrictEqual([
    { input: { id: `instagram:${placeId}` }, toolName: "getTaggedPlace" },
  ]);
  expect(found.toolOutputs).toStrictEqual([
    {
      place: {
        ...syntheticCafe,
        address: "1 Synthetic Street",
        hasMoreStories: false,
        latestStories: [{ date: syntheticCafe.latestStoryDate, owner: "@user_008" }],
      },
      status: "found",
    },
  ]);
  expect(found.text).toBe(placeAnswer({ id: `instagram:${placeId}`, name: "Synthetic Cafe" }));
  expect(unknown.toolOutputs).toStrictEqual([{ id: "instagram:999", status: "unknown" }]);
  expect(unknown.text).toBe(assistantAnswer);
});

/** A question that makes the fake chat model call each tool. */
const stepAfterEachTool: Record<keyof AssistantTools, { question: string; thinksAfter: boolean }> =
  {
    getFeedUserSummaries: { question: "What about @user_072?", thinksAfter: false },
    getMentionConnection: {
      question: "Connection @user_072 and @user_008",
      thinksAfter: false,
    },
    getTaggedPlace: { question: `Place instagram:${placeId}`, thinksAfter: false },
    listAccounts: { question: "Which accounts do you know?", thinksAfter: false },
    listMentionConnections: { question: "Which mentions?", thinksAfter: false },
    listTaggedPlaces: { question: "Which places?", thinksAfter: false },
    searchAccounts: { question: "Search USER_07", thinksAfter: true },
    searchMentionConnections: { question: "Search mentions user", thinksAfter: true },
    searchTaggedPlaces: { question: "Search places CAFÉ", thinksAfter: true },
  };

test.for(Object.entries(stepAfterEachTool))(
  "after a %s result, the model reasons in the next step only for a lookup",
  async ([toolName, { question, thinksAfter }], context) => {
    const world = await createWorld(context);
    await world.run();

    const chunks = await readChunks(
      await handleChatRequest(world.runtime, chatRequest(userMessage(question))),
    );

    expect(chunks.toolInputs.map((call) => call.toolName)).toStrictEqual([toolName]);
    expect(
      world.ollama.requests.filter(({ kind }) => kind === "chat").map(({ think }) => think),
    ).toStrictEqual([true, thinksAfter]);
  },
);

test("a greeting is answered without any tool call", async (context) => {
  const world = await createWorld(context);

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("Hello!"))),
  );

  expect(chunks.toolInputs).toStrictEqual([]);
  expect(chunks.text).toBe(assistantGreeting);
});

test("an unreachable chat model streams an error", async (context) => {
  const world = await createWorld(context, { ollama: { chat: "unreachable" } });

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("What about @user_072?"))),
  );

  expect(chunks.events).toContainEqual({
    errorText: "The chat model did not answer.",
    type: "error",
  });
  expect(chunks.text).toBe("");
});

test.for([
  "server-error",
  "malformed-tool-call-before-streaming",
  "malformed-tool-call-while-streaming",
] as const)(
  "a chat model failing with %s ends the stream with the error",
  async (failure, context) => {
    const world = await createWorld(context, { ollama: { chat: failure } });

    const response = await handleChatRequest(
      world.runtime,
      chatRequest(userMessage("What about @user_072?")),
    );

    const chunks = await readChunks(response);
    expect(chunks.events.at(-1)).toStrictEqual({
      errorText: "The chat model did not answer.",
      type: "error",
    });
    expect(chunks.text).toBe("");
  },
);

test("a request that is not a conversation of UI messages is rejected", async (context) => {
  const world = await createWorld(context);
  const bodies = [
    "not json",
    JSON.stringify({ nope: true }),
    JSON.stringify({ messages: [] }),
    JSON.stringify({ messages: [{ id: "message-1", parts: [{ type: "text" }], role: "user" }] }),
  ];

  const responses = await Promise.all(
    bodies.map(async (body) => await handleChatRequest(world.runtime, chatRequest(body))),
  );

  expect(responses.map(({ status }) => status)).toStrictEqual([400, 400, 400, 400]);
  expect(world.ollama.requests).toStrictEqual([]);
});
