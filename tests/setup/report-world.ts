import { readFile } from "node:fs/promises";
import { expect, type TestContext } from "vitest";
import sharp from "sharp";
import { z } from "zod";
import { JsonValueSchema, type JsonValue } from "@@/core/utils/json-value.ts";
import { createReport } from "@@/core/domains/fetch-run/report.ts";
import type { RuntimeBoundaries } from "@@/core/domains/runtime/runtime.ts";
import { createCapturingLogger } from "../mock-helpers.ts";
import {
  createRecordedInstagramClient,
  editRecordedStories,
  keepRecordedStories,
  readRecordedPayloads,
  type RecordedPayloads,
} from "./seed.ts";
import { createTestRuntime } from "./test-runtime.ts";

/**
 * A pipeline world for tests: a test runtime with fakes for the external systems only
 * (Instagram, Ollama, Apple OCR, media downloads).
 */
export const now = new Date("2026-10-29T12:00:00.000Z");
const HOUR = 3600;
export const publishedBefore = { now, seconds: HOUR };

export const imageStoryPk = "700000000000079";
export const musicStoryPk = "700000000000900";
export const plainStoryPk = "700000000000116";
export const storyPks = [imageStoryPk, plainStoryPk, musicStoryPk];
export const placeId = "111";
export const audioAssetId = "900000000000001";
export const audioUrl = "https://example.com/synthetic-song.m4a";
const coverUrl = "https://example.com/synthetic-cover.png";

function musicAssetBody(): JsonValue {
  return {
    metadata: {
      music_info: {
        music_asset_info: {
          audio_asset_id: audioAssetId,
          cover_artwork_uri: coverUrl,
          display_artist: "Synthetic Artist",
          progressive_download_url: audioUrl,
          title: "Synthetic Song",
        },
      },
    },
  };
}

function placeBody(): JsonValue {
  return {
    data: {
      xdt_location_get_web_info: {
        native_location_data: {
          location_info: {
            category: "Cafe",
            lat: 48.5,
            lng: 2.5,
            location_address: "1 Synthetic Street",
            location_city: "Syntheville",
            location_id: placeId,
            location_zip: "00000",
            name: "Synthetic Cafe",
          },
        },
      },
    },
  };
}

/**
 * The recorded gallery, given the stickers the recording lacks: a tagged place on the image
 * story and a music sticker with a downloadable audio asset on the last story.
 */
export async function recordedPayloads(
  editStory?: (story: RecordedStory) => void,
): Promise<RecordedPayloads> {
  const recorded = keepRecordedStories(
    await readRecordedPayloads(["instagram-story-data.json"]),
    storyPks,
  );
  return {
    ...editRecordedStories(recorded, (story) => {
      if (story.pk === imageStoryPk) {
        story.story_locations = [
          { id: "synthetic-location-sticker", location: { name: "Synthetic Cafe", pk: placeId } },
        ];
      }
      if (story.pk === musicStoryPk) {
        story.story_music_stickers = [
          {
            id: "synthetic-music-sticker",
            music_asset_info: { audio_asset_id: audioAssetId, title: "Original" },
          },
        ];
      }
      editStory?.(story);
    }),
    musicAsset: musicAssetBody(),
    place: placeBody(),
  };
}

function trayEntry(reelId: string, username: string, mediaIds: Array<string>) {
  return { id: reelId, media_ids: mediaIds, user: { id: reelId, pk: reelId, username } };
}

/** The recorded tray, with a third account whose stories the gallery does not serve. */
export function trayBody(options: { withMissingReel?: boolean } = {}): JsonValue {
  return {
    broadcasts: [],
    status: "ok",
    story_ranking_token: "synthetic",
    tray: [
      trayEntry("700000000000001", "user_008", [imageStoryPk]),
      trayEntry("700000000000068", "user_072", [plainStoryPk, musicStoryPk]),
      ...(options.withMissingReel === true
        ? [trayEntry("700000000000999", "user_999", ["700000000000998"])]
        : []),
    ],
  };
}

type RecordedStory = Parameters<Parameters<typeof editRecordedStories>[1]>[0];

type OllamaFailure = "server-error" | "unreachable";

/**
 * How the chat model fails. A malformed tool call fails Ollama's tool call parser: before any
 * chunk, Ollama answers with an error status; once it has streamed chunks, it ends the stream
 * with an `error` line.
 */
type OllamaChatFailure =
  | OllamaFailure
  | "malformed-tool-call-before-streaming"
  | "malformed-tool-call-while-streaming";

interface OllamaBehavior {
  /** Fails the vision request of the story at this position in the run. */
  vision?: (position: number) => OllamaFailure | undefined;
  summary?: OllamaFailure;
  chat?: OllamaChatFailure;
}

function jsonResponse(body: JsonValue, status = 200) {
  return globalThis.Response.json(body, { status });
}

function fail(failure: OllamaFailure) {
  if (failure === "unreachable") {
    throw new TypeError("fetch failed");
  }
  return jsonResponse({ error: "model crashed" }, 500);
}

const OllamaRequestSchema = z.object({
  images: z.array(z.string()).optional(),
  prompt: z.string(),
});

const OllamaChatRequestSchema = z.object({
  messages: z.array(z.object({ content: z.string(), role: z.string() })),
  think: z.boolean().optional(),
  tools: z.array(z.object({ function: z.object({ name: z.string() }) })).default([]),
});

/** What the chat model answers once it has read a tool result. */
export const assistantAnswer =
  "Synthetic **answer** from the tool result, about @user_072 and @user_999.";
/** What the chat model answers once it has read a found Tagged place: a link to it. */
export function placeAnswer(place: { id: string; name: string }) {
  return `Synthetic answer about [${place.name}](place:${place.id}).`;
}
/**
 * What the chat model answers once it has listed or found places: like a small model, it names
 * them without their place links, and links the first one elsewhere.
 */
export function placesAnswer(names: Array<string>) {
  return `Synthetic answer naming ${names.join(", ")}, and [${names.at(0) ?? ""}](https://example.com/elsewhere).`;
}
/** What the chat model answers to a message that needs no tool. */
export const assistantGreeting = "Synthetic greeting.";
export const assistantThinking = "Synthetic reasoning about the question.";

const FoundPlaceSchema = z.object({
  place: z.object({ id: z.string(), name: z.string() }),
  status: z.literal("found"),
});

/** A tool result as JSON, or null when it is not JSON. */
function parseJson(content: string): JsonValue {
  try {
    return JsonValueSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

const ListedPlacesSchema = z.object({
  places: z.array(z.object({ name: z.string() })).min(1),
});

/**
 * The answer to a tool result: a link to the place it found, the places it listed or found, or
 * the synthetic answer.
 */
function answerToolResult(content: string) {
  const result = parseJson(content);
  const found = FoundPlaceSchema.safeParse(result);
  if (found.success) {
    return placeAnswer(found.data.place);
  }
  const listed = ListedPlacesSchema.safeParse(result);
  return listed.success
    ? placesAnswer(listed.data.places.map(({ name }) => name))
    : assistantAnswer;
}

function ndjsonResponse(...lines: Array<JsonValue>) {
  return new globalThis.Response(lines.map((line) => JSON.stringify(line)).join("\n"));
}

const chatDone = {
  done: true,
  done_reason: "stop",
  eval_count: 1,
  model: "synthetic",
  prompt_eval_count: 1,
};

function chatMessage(message: JsonValue) {
  return ndjsonResponse({ done: false, message, model: "synthetic" }, chatDone);
}

/** Ollama's error when the chat model's tool call is not well-formed XML. */
const malformedToolCallError =
  "XML syntax error on line 3: element <function> closed by </parameter>";

function failChat(failure: OllamaChatFailure) {
  if (failure === "malformed-tool-call-before-streaming") {
    return jsonResponse({ error: malformedToolCallError }, 500);
  }
  if (failure === "malformed-tool-call-while-streaming") {
    return ndjsonResponse(
      {
        done: false,
        message: { content: "", role: "assistant", thinking: assistantThinking },
        model: "synthetic",
      },
      { error: malformedToolCallError },
    );
  }
  return fail(failure);
}

function chatToolCall(name: string, args: JsonValue) {
  return chatMessage({
    content: "",
    role: "assistant",
    thinking: assistantThinking,
    tool_calls: [{ function: { arguments: args, name } }],
  });
}

/** The place tool call the chat model makes for a question about places, if any. */
function callPlaceTool(question: string, usernames: Array<string>, offered: Set<string>) {
  const args: Record<string, JsonValue> = {};
  const offset = /\boffset\s+(?<offset>\d+)$/iu.exec(question)?.groups?.offset;
  if (offset !== undefined) {
    args.offset = Number(offset);
  }
  const id = /^(?:place|lieu)\s+(?<id>\S+)$/iu.exec(question)?.groups?.id;
  if (id !== undefined && offered.has("getTaggedPlace")) {
    return chatToolCall("getTaggedPlace", { id });
  }
  const query =
    /^(?:search|cherche)\s+(?:places|lieux)\s+(?<query>.+?)(?:\s+offset\s+\d+)?$/iu.exec(question)
      ?.groups?.query;
  if (query !== undefined && offered.has("searchTaggedPlaces")) {
    return chatToolCall("searchTaggedPlaces", { query, ...args });
  }
  if (/\b(?:places|lieux)\b/iu.test(question) && offered.has("listTaggedPlaces")) {
    if (usernames.length > 0) {
      args.usernames = usernames;
    }
    return chatToolCall("listTaggedPlaces", args);
  }
  return null;
}

/**
 * The chat model, in Ollama's streamed wire format. It calls only the tools it is offered:
 * a Tagged place when the message is "place <id>", a search of the places when it starts with
 * "search places", the places (of its `@username`s, from "offset <n>") when it asks about
 * places, the user summaries of the `@username`s of the last user message, a search of the
 * accounts when the message starts with "search", or the accounts when the message asks
 * about accounts. It answers once it has a tool result, and greets any
 * other message without a tool.
 */
function answerChat({ messages, tools }: z.infer<typeof OllamaChatRequestSchema>) {
  // Only a tool result of the last question: earlier turns keep theirs in the conversation.
  const lastQuestion = messages.findLastIndex(({ role }) => role === "user");
  const toolResult = messages.slice(lastQuestion).findLast(({ role }) => role === "tool");
  if (toolResult !== undefined) {
    return chatMessage({ content: answerToolResult(toolResult.content), role: "assistant" });
  }
  const offered = new Set(tools.map((tool) => tool.function.name));
  const question = messages.findLast(({ role }) => role === "user")?.content ?? "";
  const usernames = [...question.matchAll(/@(?<username>[\w.]+)/gu)].map(
    ({ groups }) => groups?.username ?? "",
  );
  const placeCall = callPlaceTool(question, usernames, offered);
  if (placeCall !== null) {
    return placeCall;
  }
  if (usernames.length > 0 && offered.has("getFeedUserSummaries")) {
    return chatToolCall("getFeedUserSummaries", { usernames });
  }
  const query = /^(?:search|cherche)\s+(?<query>.+)$/iu.exec(question)?.groups?.query;
  if (query !== undefined && offered.has("searchAccounts")) {
    return chatToolCall("searchAccounts", { query });
  }
  if (/\b(?:accounts|comptes)\b/iu.test(question) && offered.has("listAccounts")) {
    return chatToolCall("listAccounts", {});
  }
  return chatMessage({ content: assistantGreeting, role: "assistant" });
}

/**
 * An Ollama server: vision requests carry the image, summary requests the story data, chat
 * requests the conversation.
 */
function createOllama(behavior: OllamaBehavior = {}) {
  const requests: Array<{
    kind: "chat" | "summary" | "vision";
    prompt: string;
    /** Whether a chat request asked the model to reason. */
    think?: boolean;
  }> = [];
  let visions = 0;
  async function fetchOllama(_input: RequestInfo | URL, init?: RequestInit) {
    const json: unknown = JSON.parse(z.string().parse(init?.body));
    const chat = OllamaChatRequestSchema.safeParse(json);
    if (chat.success) {
      requests.push({
        kind: "chat",
        prompt: chat.data.messages.at(-1)?.content ?? "",
        think: chat.data.think,
      });
      return await Promise.resolve(
        behavior.chat === undefined ? answerChat(chat.data) : failChat(behavior.chat),
      );
    }
    const body = OllamaRequestSchema.parse(json);
    if (body.images !== undefined) {
      expect(body.images).toHaveLength(1);
      requests.push({ kind: "vision", prompt: body.prompt });
      const position = visions;
      visions += 1;
      const failure = behavior.vision?.(position);
      return await Promise.resolve(
        failure === undefined
          ? jsonResponse({
              done: true,
              response: JSON.stringify({
                description: `Synthetic scene ${position}`,
                ocrText: [`Synthetic sign ${position}`],
              }),
            })
          : fail(failure),
      );
    }
    requests.push({ kind: "summary", prompt: body.prompt });
    if (behavior.summary !== undefined) {
      return await Promise.resolve(fail(behavior.summary));
    }
    const username = /"username": "(?<username>[^"]+)"/u.exec(body.prompt)?.groups?.username;
    return await Promise.resolve(
      jsonResponse({ done: true, response: JSON.stringify({ summary: `Summary of ${username}` }) }),
    );
  }
  return { fetchOllama, requests };
}

export async function createWorld(
  context: Pick<TestContext, "onTestFinished">,
  options: {
    backup?: RuntimeBoundaries["backup"];
    client?: RuntimeBoundaries["client"];
    /** Edits each recorded story before the fetch, e.g. to tag more places. */
    editStory?: (story: RecordedStory) => void;
    ollama?: OllamaBehavior;
    ocr?: (position: number) => string | Error;
    queue?: RuntimeBoundaries["queue"];
  } = {},
) {
  const logger = createCapturingLogger();
  // What the pipeline asked the outside world for, in order.
  const calls: Array<string> = [];
  const backups: Array<Date> = [];
  const png = await sharp({ create: { background: "teal", channels: 3, height: 8, width: 8 } })
    .png()
    .toBuffer();
  const audio = await readFile(new globalThis.URL("../fixtures/audio-clip.m4a", import.meta.url));
  const ollama = createOllama(options.ollama);
  let ocrCalls = 0;
  const runtime = await createTestRuntime(context, {
    backup: (at) => {
      backups.push(at);
      options.backup?.(at);
    },
    client:
      options.client ??
      (await createRecordedInstagramClient(await recordedPayloads(options.editStory), {
        publishedBefore,
      })),
    fetchImage: async (url) => {
      calls.push(`image ${url}`);
      return await Promise.resolve({
        arrayBuffer: async () => await Promise.resolve(new Uint8Array(png).buffer),
        headers: { get: () => "image/png" },
        ok: true,
        status: 200,
      });
    },
    fetchMedia: async (url) => {
      calls.push(`media ${url}`);
      return await Promise.resolve(
        url === audioUrl
          ? new globalThis.Response(audio, { headers: { "content-type": "video/mp4" } })
          : new globalThis.Response(png, { headers: { "content-type": "image/png" } }),
      );
    },
    fetchOllama: ollama.fetchOllama,
    logger,
    queue: options.queue,
    runAppleOcr: async () => {
      calls.push("ocr");
      const outcome = options.ocr?.(ocrCalls) ?? `Synthetic caption ${ocrCalls}`;
      ocrCalls += 1;
      if (outcome instanceof Error) {
        throw outcome;
      }
      return await Promise.resolve(outcome);
    },
  });
  return {
    ...runtime,
    backups,
    calls,
    logger,
    ollama,
    run: async (clock = () => now) => await createReport(runtime, { now: clock }),
    runs: runtime.fetchRuns,
    runtime,
  };
}
