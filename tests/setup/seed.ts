import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { type JsonObject, type JsonValue, JsonValueSchema } from "@@/core/utils/json-value.ts";
import { persistReportInstagramUsers } from "@@/core/domains/accounts/instagram-user.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { fetchStories } from "@@/core/domains/fetch-run/stories.ts";
import { createRecordedClient, RecordedGalleryPageSchema } from "./recorded-client.ts";
import { connect } from "./test-boundaries.ts";

const fixturesDirectory = path.join(import.meta.dirname, "../fixtures");
const TRAY_FILE = "instagram-reels-tray.json";
const PLACE_FILE = "instagram-place.json";
const MUSIC_ASSET_FILE = "instagram-music-asset.json";
const GALLERY_FILE = /^instagram-story-data(?:-\d+)?\.json$/u;
const TIMESTAMP_KEYS = new Set(["taken_at", "latest_reel_media", "expiring_at"]);

export interface RecordedPayloads {
  galleryPages: Array<JsonValue>;
  /** The reels tray body. When absent it is derived from the reels of the gallery pages. */
  tray?: JsonValue;
  place?: JsonValue;
  musicAsset?: JsonValue;
}

export interface SeedOptions {
  /** Shift every recorded timestamp so the newest recorded story was published this long before `now`. */
  publishedBefore?: { now: Date; seconds: number };
}

async function readJson(name: string): Promise<JsonValue> {
  return JsonValueSchema.parse(
    JSON.parse(await readFile(path.join(fixturesDirectory, name), "utf-8")),
  );
}

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

type GalleryConnection = z.output<
  typeof RecordedGalleryPageSchema
>["data"]["xdt_api__v1__feed__reels_media__connection"];

type RecordedStory = NonNullable<GalleryConnection["edges"][number]["node"]["items"]>[number];

function updateGalleryPage(
  payload: JsonValue,
  update: (connection: GalleryConnection) => void,
): JsonValue {
  const page = RecordedGalleryPageSchema.parse(payload);
  update(page.data.xdt_api__v1__feed__reels_media__connection);

  return JsonValueSchema.parse(page);
}

/** Edits travel through real ingestion with the rest of the recording. */
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

type RecordedUser = NonNullable<GalleryConnection["edges"][number]["node"]["user"]>;

/** Edits travel through real ingestion with the rest of the recording. */
export function editRecordedUsers(
  recorded: RecordedPayloads,
  edit: (user: RecordedUser, position: number) => void,
): RecordedPayloads {
  let position = 0;

  return {
    ...recorded,
    galleryPages: recorded.galleryPages.map((payload) =>
      updateGalleryPage(payload, ({ edges }) => {
        for (const { node } of edges) {
          if (node.user !== undefined) {
            edit(node.user, position);
            position += 1;
          }
        }
      }),
    ),
  };
}

export function mentionStickers(mentions: Array<{ username?: string; full_name?: string }>) {
  return mentions.map((mention) => ({ bloks_sticker: { sticker_data: { ig_mention: mention } } }));
}

/** The page is parsed again afterwards, so the copies share nothing with the story they copy. */
export function addRecordedReels(
  recorded: RecordedPayloads,
  reels: Array<{ userPk: string; username: string; storyPk: string }>,
): RecordedPayloads {
  const [firstPage, ...otherPages] = recorded.galleryPages;

  return {
    ...recorded,
    galleryPages: [
      updateGalleryPage(firstPage, (connection) => {
        const [template] = connection.edges;
        const [story] = template.node.items ?? [];
        const storyUser = story.user;

        for (const { userPk, username, storyPk } of reels) {
          connection.edges.push({
            ...template,
            node: {
              ...template.node,
              id: userPk,
              user: { ...template.node.user, pk: userPk, id: userPk, username },
              items: [
                {
                  ...story,
                  pk: storyPk,
                  id: storyPk,
                  user: isJsonObject(storyUser)
                    ? { ...storyUser, pk: userPk, id: userPk }
                    : storyUser,
                },
              ],
            },
          });
        }
      }),
      ...otherPages,
    ],
  };
}

export function addRecordedStories(
  recorded: RecordedPayloads,
  stories: Array<{ userPk: string; storyPk: string }>,
): RecordedPayloads {
  const copiedUserPks = new Set<string>();

  const galleryPages = recorded.galleryPages.map((payload) =>
    updateGalleryPage(payload, ({ edges }) => {
      for (const { node } of edges) {
        const items = node.items ?? [];
        const added = stories.filter(({ userPk }) => userPk === node.user?.pk);

        if (added.length > 0 && items.length > 0) {
          node.items = [
            ...items,
            ...added.map(({ storyPk }) => ({ ...items[0], pk: storyPk, id: storyPk })),
          ];
          copiedUserPks.add(added[0].userPk);
        }
      }
    }),
  );

  const missing = stories.filter(({ userPk }) => !copiedUserPks.has(userPk));

  if (missing.length > 0) {
    throw new Error(
      `No recorded story to copy for ${missing.map(({ userPk }) => userPk).join(", ")}`,
    );
  }

  return { ...recorded, galleryPages };
}

/** The tray is dropped too, so the client derives it from the remaining stories. */
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

/** Only the transport is replaced, so a recording that no longer matches the schemas fails the seed instead of storing less. */
export async function seedRecordedStories(
  runtime: Pick<Runtime, "logger" | "storage" | "stories" | "users">,
  recorded?: RecordedPayloads,
  options: SeedOptions = {},
) {
  const report = await fetchStories(
    { ...runtime, openInstagram: connect(await createRecordedInstagramClient(recorded, options)) },
    { maxAttempts: 1 },
  );

  if (report.failures.length > 0) {
    throw new Error(
      `Seeding failed for ${report.failures.length} recorded stories: ${report.failures
        .map(({ message }) => message)
        .join("; ")}`,
    );
  }

  await persistReportInstagramUsers(runtime, globalThis.structuredClone(report));

  return report;
}
