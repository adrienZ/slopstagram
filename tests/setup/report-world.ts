import { readFile } from "node:fs/promises";
import { expect, type TestContext } from "vitest";
import sharp from "sharp";
import { z } from "zod";
import type { JsonValue } from "@@/core/utils/json-value.ts";
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
const plainStoryPk = "700000000000116";
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
export async function recordedPayloads(): Promise<RecordedPayloads> {
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

type OllamaFailure = "server-error" | "unreachable";

interface OllamaBehavior {
  /** Fails the vision request of the story at this position in the run. */
  vision?: (position: number) => OllamaFailure | undefined;
  summary?: OllamaFailure;
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

/** An Ollama server: vision requests carry the image, summary requests the story data. */
function createOllama(behavior: OllamaBehavior = {}) {
  const requests: Array<{ kind: "summary" | "vision"; prompt: string }> = [];
  let visions = 0;
  async function fetchOllama(_input: RequestInfo | URL, init?: RequestInit) {
    const body = OllamaRequestSchema.parse(JSON.parse(z.string().parse(init?.body)));
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
  context: TestContext,
  options: {
    backup?: RuntimeBoundaries["backup"];
    client?: RuntimeBoundaries["client"];
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
      (await createRecordedInstagramClient(await recordedPayloads(), { publishedBefore })),
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
