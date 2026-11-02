import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { DrizzleDatabase } from "../../sdk/database/client.ts";
import { useDrizzle } from "../../sdk/database/client.ts";
import { migrateDatabase } from "../../sdk/database/migrate.ts";
import { type JsonObject, type JsonValue, JsonValueSchema } from "../../sdk/lib/json-value.ts";
import { persistReportInstagramUsers } from "../../sdk/lib/instagram-user-service.ts";
import { InstagramUserRepository } from "../../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../../sdk/repositories/story-repository.ts";
import { fetchStories } from "../../sdk/stories.ts";
import { GalleryPageSchema } from "../../sdk/story-client-service.ts";
import { createRecordedClient } from "./recorded-client.ts";
import { createMemoryStorage } from "../memory-storage.ts";
import { createMockLogger, noSleep } from "../mock-helpers.ts";

const fixturesDirectory = path.join(import.meta.dirname, "../fixtures");
const TRAY_FILE = "instagram-reels-tray.json";
const PLACE_FILE = "instagram-place.json";
const MUSIC_ASSET_FILE = "instagram-music-asset.json";
const GALLERY_FILE = /^instagram-story-data(?:-\d+)?\.json$/u;
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

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: JsonValue): value is number {
  return z.number().safeParse(value).success;
}

function newestPublication(value: JsonValue): number {
  if (Array.isArray(value)) {
    return Math.max(-Infinity, ...value.map(newestPublication));
  }
  if (isJsonObject(value)) {
    return Math.max(
      -Infinity,
      ...Object.entries(value).map(([key, child]) =>
        key === "taken_at" && isNumber(child) ? child : newestPublication(child),
      ),
    );
  }
  return -Infinity;
}

function shiftTimestamps(value: JsonValue, offsetSeconds: number): JsonValue {
  if (Array.isArray(value)) {
    return value.map((child) => shiftTimestamps(child, offsetSeconds));
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        TIMESTAMP_KEYS.has(key) && isNumber(child)
          ? child + offsetSeconds
          : shiftTimestamps(child, offsetSeconds),
      ]),
    );
  }
  return value;
}

function shiftPayloads(
  recorded: RecordedPayloads,
  publishedBefore: NonNullable<SeedOptions["publishedBefore"]>,
): RecordedPayloads {
  const newest = newestPublication(recorded.galleryPages);
  if (newest === -Infinity) {
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

type GalleryConnection = NonNullable<
  z.output<typeof GalleryPageSchema>["data"]
>["xdt_api__v1__feed__reels_media__connection"];
type RecordedStory = NonNullable<GalleryConnection["edges"][number]["node"]["items"]>[number];

/** Parses a recorded gallery page with the production schema, lets `update` edit it, and writes it back as a payload. */
function updateGalleryPage(
  payload: JsonValue,
  update: (connection: GalleryConnection) => void,
): JsonValue {
  const page = GalleryPageSchema.parse(payload);
  const connection = page.data?.xdt_api__v1__feed__reels_media__connection;
  if (connection === undefined) {
    throw new Error("A recorded gallery page has no reels connection");
  }
  update(connection);
  return JsonValueSchema.parse(page);
}

/**
 * Returns the recorded payloads with every story edited by `edit`. The edits travel through
 * real ingestion with the rest of the recording, so a test can give a story a caption, a
 * date or a sticker the recordings lack.
 */
export function editRecordedStories(
  recorded: RecordedPayloads,
  edit: (story: RecordedStory) => void,
): RecordedPayloads {
  return {
    ...recorded,
    galleryPages: recorded.galleryPages.map((payload) =>
      updateGalleryPage(payload, ({ edges }) => {
        for (const { node } of edges) {
          for (const story of node.items ?? []) {
            edit(story);
          }
        }
      }),
    ),
  };
}

/**
 * Returns the recorded payloads with only the stories whose media ids are listed, dropping
 * the reels left without a story. The recorded tray is dropped too, so the client derives
 * it from the stories that remain.
 */
export function keepRecordedStories(
  recorded: RecordedPayloads,
  mediaPks: Array<string>,
): RecordedPayloads {
  return {
    ...recorded,
    galleryPages: recorded.galleryPages.map((payload) =>
      updateGalleryPage(payload, (connection) => {
        for (const { node } of connection.edges) {
          node.items = node.items?.filter(({ pk }) => mediaPks.includes(pk));
        }
        connection.edges = connection.edges.filter(({ node }) => (node.items?.length ?? 0) > 0);
      }),
    ),
    tray: undefined,
  };
}

/**
 * The recorded Instagram client over the given payloads, or over the recorded fixtures
 * when none are given, shifted in time when `publishedBefore` is set. It is the only fake
 * in the seed and in report creation tests.
 */
export async function createRecordedInstagramClient(
  recorded?: RecordedPayloads,
  options: Pick<SeedOptions, "publishedBefore"> = {},
) {
  const payloads =
    options.publishedBefore === undefined
      ? (recorded ?? (await readRecordedPayloads()))
      : shiftPayloads(recorded ?? (await readRecordedPayloads()), options.publishedBefore);
  return createRecordedClient(payloads);
}

/**
 * Ingests recorded Instagram payloads the way production does: the production response
 * parsers over the recordings, then the real fetch, story storage, place and music
 * enrichment, and user persistence. Only the transport is replaced, so a recording that
 * no longer matches the validation schemas fails the seed, with the reason, instead of
 * storing less than production would.
 *
 * Media caching, captions, vision and summaries are not run: they need the network or
 * local models. Returns the report the fetch produced.
 */
export async function seedRecordedStories(recorded?: RecordedPayloads, options: SeedOptions = {}) {
  const database = options.database ?? useDrizzle();
  migrateDatabase(database);

  const now = options.publishedBefore?.now;
  const logger = createMockLogger();
  const report = await fetchStories({
    client: await createRecordedInstagramClient(recorded, options),
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
