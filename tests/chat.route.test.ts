import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import {
  assistantAnswer,
  assistantGreeting,
  assistantThinking,
  createWorld,
  now,
} from "./setup/report-world.ts";

beforeEach(() => {
  // The Assistant reads the story feed of the current time.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

const ChunkSchema = z.looseObject({ type: z.string() });

function chatRequest(body: string) {
  return new globalThis.Request("http://localhost/api/chat", { body, method: "POST" });
}

function userMessage(text: string) {
  return JSON.stringify({
    messages: [{ id: "message-1", parts: [{ text, type: "text" }], role: "user" }],
  });
}

type Chunk = z.infer<typeof ChunkSchema>;

function joinDeltas(events: Array<Chunk>, type: string) {
  return events
    .filter((chunk) => chunk.type === type)
    .map((chunk) => z.string().parse(chunk.delta))
    .join("");
}

/** The UI message stream chunks of a chat response, in order. */
async function readChunks(response: Response) {
  const stream = await response.text();
  const events = stream.split("\n\n").flatMap((event) => {
    const data = event.replace(/^data: /u, "").trim();
    return data.length === 0 || data === "[DONE]" ? [] : [ChunkSchema.parse(JSON.parse(data))];
  });
  return {
    events,
    reasoning: joinDeltas(events, "reasoning-delta"),
    text: joinDeltas(events, "text-delta"),
    toolInputs: events
      .filter((chunk) => chunk.type === "tool-input-available")
      .map((chunk) => ({ input: chunk.input, toolName: chunk.toolName })),
    toolOutputs: events
      .filter((chunk) => chunk.type === "tool-output-available")
      .map((chunk) => chunk.output),
  };
}

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
    { input: { username: "User_072" }, toolName: "getFeedUserSummary" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([
    { status: "found", storyCount: 2, summary: "Summary of user_072", username: "user_072" },
  ]);
  expect(chunks.reasoning).toBe(assistantThinking);
  expect(chunks.text).toBe(assistantAnswer);
});

test("an unknown account streams the unknown_account outcome", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("And @user_999?"))),
  );

  expect(chunks.toolInputs).toStrictEqual([
    { input: { username: "user_999" }, toolName: "getFeedUserSummary" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([{ error: "unknown_account", status: "error" }]);
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
    { reason: "no_stories_in_last_24h", status: "missing", username: "user_008" },
  ]);
});

test("an account whose summary was not generated streams not_generated, without generating one", async (context) => {
  const world = await createWorld(context, { ollama: { summary: "server-error" } });
  await world.run();

  const chunks = await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage("What about @user_072?"))),
  );

  expect(chunks.toolOutputs).toStrictEqual([
    { reason: "not_generated", status: "missing", username: "user_072" },
  ]);
  expect(
    world.ollama.requests.map(({ kind }) => kind).filter((kind) => kind !== "vision"),
  ).toStrictEqual(["summary", "summary", "chat", "chat"]);
});

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
