import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { z } from "zod";
import type { DrizzleDatabase } from "../sdk/database/client.ts";
import { useDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { type JsonValue, JsonValueSchema } from "../sdk/lib/json-value.ts";
import { persistReportInstagramUsers } from "../sdk/lib/instagram-user-service.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStories } from "../sdk/stories.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";
import { createRecordedSession } from "./instagram-session.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import { createMockLogger, noSleep } from "./mock-helpers.ts";

const fixturesDirectory = fileURLToPath(new URL("fixtures", import.meta.url));
const TRAY_FILE = "instagram-reels-tray.json";
const PLACE_FILE = "instagram-place.json";
const MUSIC_ASSET_FILE = "instagram-music-asset.json";
const GALLERY_FILE = /^instagram-story-data(?:-\d+)?\.json$/u;
const CURSOR_PREFIX = "seed-cursor-";
const TIMESTAMP_KEYS = new Set(["taken_at", "latest_reel_media", "expiring_at"]);

/** Recorded Instagram response bodies, as the capture command writes them. */
export interface RecordedPayloads {
  /** One body per reels media page, in the order Instagram returned them. */
  galleryPages: Array<JsonValue>;
  /** The reels tray body. When absent it is derived from the reels of the gallery pages. */
  tray?: JsonValue;
  place?: JsonValue;
  musicAsset?: JsonValue;
}

export interface SeedOptions {
  /** Database to ingest into. Defaults to the application database, which is in memory under vitest. */
  database?: DrizzleDatabase;
  /** Shift every recorded timestamp so the newest recorded story was published this long before `now`. */
  publishedBefore?: { now: Date; seconds: number };
}

async function readJson(name: string): Promise<JsonValue> {
  return JsonValueSchema.parse(
    JSON.parse(await readFile(path.join(fixturesDirectory, name), "utf-8")),
  );
}

/**
 * Reads recorded payloads from tests/fixtures. Without names it reads the gallery pages
 * and, when present, the tray, place and music asset recordings. Naming files picks a
 * smaller set, e.g. one gallery page.
 */
export async function readRecordedPayloads(names?: Array<string>): Promise<RecordedPayloads> {
  const available = new Set(await readdir(fixturesDirectory));
  const selected = names ?? [...available];
  const missing = selected.filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new Error(`Recorded payloads not found in tests/fixtures: ${missing.join(", ")}`);
  }
  const galleryNames = selected.filter((name) => GALLERY_FILE.test(name)).toSorted();
  if (galleryNames.length === 0) {
    throw new Error("No recorded reels media payload selected");
  }
  async function readOptional(name: string): Promise<JsonValue | undefined> {
    return selected.includes(name) ? await readJson(name) : undefined;
  }
  return {
    galleryPages: await Promise.all(galleryNames.map(readJson)),
    musicAsset: await readOptional(MUSIC_ASSET_FILE),
    place: await readOptional(PLACE_FILE),
    tray: await readOptional(TRAY_FILE),
  };
}

function isTimestamp(key: string, value: JsonValue): value is number {
  return TIMESTAMP_KEYS.has(key) && z.number().safeParse(value).success;
}

function newestPublication(payloads: Array<JsonValue>): number | undefined {
  const published: Array<number> = [];
  JSON.stringify(payloads, (key, value: JsonValue) => {
    if (key === "taken_at" && isTimestamp(key, value)) {
      published.push(value);
    }
    return value;
  });
  return published.length === 0 ? undefined : Math.max(...published);
}

function shiftTimestamps(payload: JsonValue, offsetSeconds: number): JsonValue {
  return JsonValueSchema.parse(
    JSON.parse(JSON.stringify(payload), (key, value: JsonValue) =>
      isTimestamp(key, value) ? value + offsetSeconds : value,
    ),
  );
}

function shiftPayloads(
  recorded: RecordedPayloads,
  publishedBefore: NonNullable<SeedOptions["publishedBefore"]>,
): RecordedPayloads {
  const newest = newestPublication(recorded.galleryPages);
  if (newest === undefined) {
    throw new Error("The recorded payloads hold no story to shift in time");
  }
  const offset =
    Math.floor(publishedBefore.now.getTime() / 1000) - publishedBefore.seconds - newest;
  return {
    ...recorded,
    galleryPages: recorded.galleryPages.map((page) => shiftTimestamps(page, offset)),
    tray: recorded.tray === undefined ? undefined : shiftTimestamps(recorded.tray, offset),
  };
}

const EditableReelsPageSchema = z.looseObject({
  data: z.looseObject({
    xdt_api__v1__feed__reels_media__connection: z.looseObject({
      edges: z.array(
        z.looseObject({
          node: z.looseObject({
            items: z.array(
              z.looseObject({
                accessibility_caption: z.string().nullish(),
                pk: z.string(),
                taken_at: z.number(),
              }),
            ),
            user: z.looseObject({
              full_name: z.string().nullish(),
              username: z.string(),
            }),
          }),
        }),
      ),
    }),
  }),
});

type RecordedNode = z.infer<
  typeof EditableReelsPageSchema
>["data"]["xdt_api__v1__feed__reels_media__connection"]["edges"][number]["node"];
export type RecordedStory = RecordedNode["items"][number];
export type RecordedOwner = RecordedNode["user"];

/**
 * Returns the recorded payloads with every story, and the account that published it,
 * edited by `edit`. The edits travel through real ingestion with the rest of the recording,
 * so a test can give a story a caption, a date or an owner name the recordings lack.
 */
export function editRecordedStories(
  recorded: RecordedPayloads,
  edit: (story: RecordedStory, owner: RecordedOwner) => void,
): RecordedPayloads {
  return {
    ...recorded,
    galleryPages: recorded.galleryPages.map((payload): JsonValue => {
      const page = EditableReelsPageSchema.parse(payload);
      for (const { node } of page.data.xdt_api__v1__feed__reels_media__connection.edges) {
        for (const story of node.items) {
          edit(story, node.user);
        }
      }
      return JsonValueSchema.parse(page);
    }),
  };
}

const RecordedReelSchema = z.object({
  id: z.string(),
  items: z.array(z.object({ pk: z.string() })),
  user: JsonValueSchema,
});

const GalleryPageSchema = z.object({
  data: z.object({
    xdt_api__v1__feed__reels_media__connection: z.object({
      edges: z.array(z.object({ node: JsonValueSchema })),
    }),
  }),
});

function galleryNodes(page: JsonValue): Array<JsonValue> {
  return GalleryPageSchema.parse(page).data.xdt_api__v1__feed__reels_media__connection.edges.map(
    ({ node }) => node,
  );
}

function deriveTray(galleryPages: Array<JsonValue>): JsonValue {
  return {
    broadcasts: [],
    status: "ok",
    story_ranking_token: "seed",
    tray: galleryPages.flatMap((page) =>
      galleryNodes(page).map((node) => {
        const reel = RecordedReelSchema.parse(node);
        return {
          id: reel.id,
          media_ids: reel.items.map(({ pk }) => pk),
          user: reel.user,
        };
      }),
    ),
  };
}

function cursorOfPage(index: number): string {
  return `${CURSOR_PREFIX}${index}`;
}

/**
 * Serves the recorded pages as one chain, whatever reels are asked for: page `n` is
 * reached through the cursor of page `n - 1`, and only the last page ends the chain.
 */
function createGalleryPages(galleryPages: Array<JsonValue>) {
  const lastIndex = galleryPages.length - 1;
  function galleryPage(reelIds: Array<string>, after: string | undefined): JsonValue {
    const index = after === undefined ? 0 : Number(after.slice(CURSOR_PREFIX.length)) + 1;
    const page = galleryPages.at(index);
    if (page === undefined) {
      throw new Error(`No recorded reels media page follows cursor ${after}`);
    }
    return {
      data: {
        xdt_api__v1__feed__reels_media__connection: {
          edges: galleryNodes(page)
            .filter((node) => reelIds.includes(RecordedReelSchema.parse(node).id))
            .map((node) => ({ node })),
          page_info: {
            end_cursor: index < lastIndex ? cursorOfPage(index) : null,
            has_next_page: index < lastIndex,
          },
        },
      },
    };
  }
  return galleryPage;
}

/**
 * Ingests recorded Instagram payloads the way production does: the real Instagram client
 * over a browser session that serves the recordings, then the real fetch, story storage,
 * place and music enrichment, and user persistence. Only the browser is replaced, so a
 * recording that no longer matches the validation schemas fails the seed, with the
 * reason, instead of storing less than production would.
 *
 * Media caching, captions, vision and summaries are not run: they need the network or
 * local models. Returns the report the fetch produced.
 */
export async function seedRecordedStories(recorded?: RecordedPayloads, options: SeedOptions = {}) {
  const payloads =
    options.publishedBefore === undefined
      ? (recorded ?? (await readRecordedPayloads()))
      : shiftPayloads(recorded ?? (await readRecordedPayloads()), options.publishedBefore);
  const database = options.database ?? useDrizzle();
  migrateDatabase(database);

  const session = createRecordedSession({
    galleryPage: createGalleryPages(payloads.galleryPages),
    musicAsset: payloads.musicAsset,
    place: payloads.place,
    tray: payloads.tray ?? deriveTray(payloads.galleryPages),
  });
  const now = options.publishedBefore?.now;
  const logger = createMockLogger();
  const report = await fetchStories([], {
    client: createInstagramClient(session),
    logger,
    maxAttempts: 1,
    now: now === undefined ? undefined : () => now,
    sleep: noSleep,
    storyRepository: new StoryRepository(database, logger),
    storyStorage: createMemoryStorage(),
  });
  if (report.failures.length > 0) {
    throw new Error(
      `Seeding failed for ${report.failures.length} recorded stories: ${report.failures
        .map(({ message }) => message)
        .join("; ")}`,
    );
  }
  await persistReportInstagramUsers(
    globalThis.structuredClone(report),
    new InstagramUserRepository(database),
  );
  return report;
}
