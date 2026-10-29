import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { StoryReelSchema } from "../sdk/lib/story-schemas.ts";
import { APP_CACHE_DIR } from "../sdk/lib/app-data-paths.ts";
import { isJsonObject, JsonValueSchema } from "../sdk/lib/json-value.ts";
import type { JsonObject, JsonValue } from "../sdk/lib/json-value.ts";

// Keys whose values identify a person, a story or a request; each distinct value gets a stable synthetic one.
const IDENTIFIER_KEYS = new Set([
  "audio_asset_id",
  "audio_cluster_id",
  "client_cache_key",
  "code",
  "fbid",
  "id",
  "interop_messaging_user_fbid",
  "media_pk",
  "mezql_token",
  "organic_tracking_token",
  "pk",
  "strong_id__",
  "user_id",
]);
// Keys whose string values are structural (enums, fixed labels), so they carry no personal data.
const STRUCTURAL_KEYS = new Set([
  "__typename",
  "logging_mechanism",
  "logging_surface",
  "product_type",
  "sticker_type",
  "type",
]);
const COORDINATE_KEYS = new Set(["lat", "lng", "latitude", "longitude"]);
// Free text, and a manifest full of media URLs, that tests do not need.
const OMITTED_KEYS = new Set(["video_dash_manifest", "caption", "accessibility_caption"]);
const FIXTURE_ID_BASE = 700_000_000_000_000n;
const COORDINATE_PLACEHOLDER = 48;
const STORIES_PER_REEL = [1, 2];

function anonymizedUrl(index: number): string {
  return `https://example.com/anonymized/instagram-media-${String(index).padStart(4, "0")}.jpg`;
}

const CachedStorySchema = z.looseObject({ user: z.object({ pk: z.string() }) });

/**
 * Replaces everything that could identify someone while keeping the payload's shape.
 * Redaction is default-deny: every string is replaced unless its key is known to be structural.
 */
export function createRedactor() {
  const replacements = new Map<string, string>();

  function replacement(kind: string, original: string, create: (index: number) => string): string {
    const key = `${kind}:${original}`;
    let value = replacements.get(key);
    if (value === undefined) {
      value = create(replacements.size + 1);
      replacements.set(key, value);
    }
    return value;
  }

  function redactText(text: string, key: string): string {
    if (IDENTIFIER_KEYS.has(key)) {
      return replacement("id", text, (index) => String(FIXTURE_ID_BASE + BigInt(index)));
    }
    if (STRUCTURAL_KEYS.has(key) || text.length === 0) {
      return text;
    }
    if (key === "username") {
      return replacement("username", text, (index) => `user_${String(index).padStart(3, "0")}`);
    }
    if (/^https?:\/\//u.test(text)) {
      return replacement("url", text, anonymizedUrl);
    }
    return replacement("text", text, (index) => `Fixture text ${index}`);
  }

  function redact(value: JsonValue, key: string): JsonValue {
    if (Array.isArray(value)) {
      return value.map((entry) => redact(entry, key));
    }
    if (isJsonObject(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([entryKey]) => !OMITTED_KEYS.has(entryKey))
          .map(([entryKey, entry]) => [entryKey, redact(entry, entryKey)]),
      );
    }
    const text = z.string().safeParse(value);
    if (text.success) {
      return redactText(text.data, key);
    }
    const number = z.number().safeParse(value);
    if (!number.success) {
      return value;
    }
    if (COORDINATE_KEYS.has(key)) {
      return COORDINATE_PLACEHOLDER;
    }
    return IDENTIFIER_KEYS.has(key) ? redactText(String(number.data), key) : number.data;
  }

  return (payload: JsonValue) => redact(payload, "");
}

function countStickers(item: JsonObject): number {
  return Object.entries(item).filter(([key, value]) => key.startsWith("story_") && value !== null)
    .length;
}

/** Picks the stickiest cached stories of the users with the most stories, grouped as gallery reels. */
export async function selectReels(cacheDirectory: string): Promise<Array<JsonObject>> {
  const directory = path.join(cacheDirectory, "stories");
  const names = await readdir(directory);
  const files = names.filter((name) => name.endsWith(".json")).toSorted();
  const byUser = new Map<string, Array<JsonObject>>();
  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- The cache holds thousands of files; read them one at a time.
    const raw = await readFile(path.join(directory, file), "utf-8");
    const item = JsonValueSchema.parse(JSON.parse(raw));
    const cached = CachedStorySchema.safeParse(item);
    if (cached.success && isJsonObject(item)) {
      byUser.set(cached.data.user.pk, [...(byUser.get(cached.data.user.pk) ?? []), item]);
    }
  }
  return [...byUser.entries()]
    .toSorted(([, left], [, right]) => right.length - left.length)
    .slice(0, STORIES_PER_REEL.length)
    .map(([userPk, items], index) => ({
      __typename: "XDTReelDict",
      id: userPk,
      user: { pk: userPk, id: userPk, username: userPk },
      items: items
        .toSorted((left, right) => countStickers(right) - countStickers(left))
        .slice(0, STORIES_PER_REEL[index]),
    }));
}

/** Wraps reels like the page of the `reels_media` GraphQL query that Instagram returns. */
export function toGalleryPayload(reels: Array<JsonValue>): JsonValue {
  return {
    data: {
      xdt_api__v1__feed__reels_media__connection: {
        edges: reels.map((node) => ({ node })),
        page_info: { has_next_page: false, end_cursor: null },
      },
    },
  };
}

async function main(): Promise<void> {
  const outputDirectory = path.resolve(process.argv[2] ?? "tests/fixtures");
  const redact = createRedactor();
  const selected = await selectReels(APP_CACHE_DIR);
  const reels = selected.map((reel) => redact(reel));
  for (const reel of reels) {
    StoryReelSchema.parse(reel);
  }
  await writeFile(
    path.join(outputDirectory, "instagram-story-data.json"),
    `${JSON.stringify(toGalleryPayload(reels), null, 2)}\n`,
  );
  process.stdout.write(`wrote ${reels.length} redacted reels to ${outputDirectory}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
