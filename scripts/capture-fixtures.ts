import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { closeInstagramSession, openInstagramSession } from "../sdk/lib/playwright-service.ts";
import { isJsonObject, JsonValueSchema } from "../sdk/lib/json-value.ts";
import type { JsonValue } from "../sdk/lib/json-value.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

// Keys whose values identify a person, a story or a request; each distinct value gets a stable synthetic one.
const IDENTIFIER_KEYS = new Set([
  "audio_asset_id",
  "audio_cluster_id",
  "client_cache_key",
  "code",
  "fbid",
  "id",
  "interop_messaging_user_fbid",
  "location_id",
  "media_ids",
  "media_pk",
  "mezql_token",
  "organic_tracking_token",
  "pk",
  "reel_ids",
  "strong_id__",
  "user_id",
]);
// Keys whose string values are structural (enums, fixed labels), so they carry no personal data.
const STRUCTURAL_KEYS = new Set([
  "__typename",
  "logging_mechanism",
  "logging_surface",
  "product_type",
  "status",
  "sticker_type",
  "type",
]);
const COORDINATE_KEYS = new Set(["lat", "lng", "latitude", "longitude"]);
// Free text, and a manifest full of media URLs, that tests do not need.
const OMITTED_KEYS = new Set(["video_dash_manifest", "caption", "accessibility_caption"]);
const FIXTURE_ID_BASE = 700_000_000_000_000n;
const COORDINATE_PLACEHOLDER = 48;
const CAPTURED_REEL_COUNT = 3;
const METADATA_FILE_NAME = "capture-metadata.json";

function anonymizedUrl(index: number): string {
  return `https://example.com/anonymized/instagram-media-${String(index).padStart(4, "0")}.jpg`;
}

/**
 * Replaces everything that could identify someone while keeping the payload's shape.
 * Redaction is default-deny: every string is replaced unless its key is known to be structural.
 * One redactor gives the same replacement to the same original, across every payload it sees.
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

type Session = Parameters<typeof createInstagramClient>[0];
type Evaluate = Session["page"]["evaluate"];

export interface CapturedPayloads {
  tray: JsonValue;
  galleryPages: Array<JsonValue>;
  place: JsonValue | null;
  musicAsset: JsonValue | null;
}

const TrayBodySchema = z.looseObject({ tray: z.array(z.looseObject({ id: z.unknown() })) });

function findFirst(value: JsonValue, key: string): string | null {
  if (Array.isArray(value)) {
    return value.map((entry) => findFirst(entry, key)).find((found) => found !== null) ?? null;
  }
  if (!isJsonObject(value)) {
    return null;
  }
  const direct = z.union([z.string(), z.number()]).safeParse(value[key]);
  if (direct.success) {
    return String(direct.data);
  }
  return (
    Object.values(value)
      .map((entry) => findFirst(entry, key))
      .find((found) => found !== null) ?? null
  );
}

/**
 * Records the raw response bodies of the first reels, one place and one music asset, by
 * running the production client over `session`. Only the first few tray entries are kept,
 * so other people in the tray never reach the recording.
 */
export async function captureInstagramPayloads(session: Session): Promise<CapturedPayloads> {
  const bodies: Array<{ requestUrl: string; body: string }> = [];
  async function recording(...args: Parameters<Evaluate>): Promise<Awaited<ReturnType<Evaluate>>> {
    const response = await session.page.evaluate(...args);
    bodies.push({ requestUrl: args[1].requestUrl, body: response.body });
    return response;
  }
  const client = createInstagramClient({ page: { evaluate: recording } });

  const trayResponse = await client.getTray();
  const { tray } = trayResponse.json();
  const reelIds = tray.slice(0, CAPTURED_REEL_COUNT).map(({ id }) => id);
  await client.getReelsMedia(reelIds);

  const trayBody = TrayBodySchema.parse(
    JsonValueSchema.parse(
      JSON.parse(
        bodies.find(({ requestUrl }) => requestUrl.endsWith("/reels_tray/"))?.body ?? "null",
      ),
    ),
  );
  const galleryPages = bodies
    .filter(({ requestUrl }) => requestUrl.endsWith("/graphql/query"))
    .map(({ body }) => JsonValueSchema.parse(JSON.parse(body)));
  const placeId = findFirst(JsonValueSchema.parse(galleryPages), "pk");
  const audioId = findFirst(JsonValueSchema.parse(galleryPages), "audio_asset_id");
  const place = placeId === null ? null : await client.getPlace?.(placeId);
  const music = audioId === null ? null : await client.getMusicAsset?.(audioId);
  return {
    tray: JsonValueSchema.parse({
      ...trayBody,
      broadcasts: [],
      tray: trayBody.tray.filter(({ id }) => reelIds.includes(String(id))),
    }),
    galleryPages,
    place: place?.ok === true ? place.json() : null,
    musicAsset: music?.ok === true ? music.json() : null,
  };
}

export function redactPayloads(payloads: CapturedPayloads): CapturedPayloads {
  const redact = createRedactor();
  return {
    tray: redact(payloads.tray),
    galleryPages: payloads.galleryPages.map((page) => redact(page)),
    place: payloads.place === null ? null : redact(payloads.place),
    musicAsset: payloads.musicAsset === null ? null : redact(payloads.musicAsset),
  };
}

export interface FixtureMetadata {
  capturedAt: string;
  files: Array<{ name: string; covers: string }>;
}

interface BuiltFixtures {
  metadata: FixtureMetadata;
  files: Array<[string, JsonValue]>;
}

/** Records when a capture ran and what each written file covers. */
export function buildFixtureMetadata(payloads: CapturedPayloads, capturedAt: Date): BuiltFixtures {
  const files: Array<[string, JsonValue, string]> = [
    [
      "instagram-reels-tray.json",
      payloads.tray,
      `Story tray limited to the first ${CAPTURED_REEL_COUNT} entries, with no live broadcasts.`,
    ],
    ...payloads.galleryPages.map((page, index): [string, JsonValue, string] => [
      index === 0 ? "instagram-story-data.json" : `instagram-story-data-${index + 1}.json`,
      page,
      `Reels media gallery page ${index + 1} for the captured tray entries.`,
    ]),
  ];
  if (payloads.place !== null) {
    files.push(["instagram-place.json", payloads.place, "One tagged place lookup response."]);
  }
  if (payloads.musicAsset !== null) {
    files.push([
      "instagram-music-asset.json",
      payloads.musicAsset,
      "One music asset lookup response.",
    ]);
  }
  return {
    metadata: {
      capturedAt: capturedAt.toISOString(),
      files: files.map(([name, , covers]) => ({ name, covers })),
    },
    files: files.map(([name, body]) => [name, body]),
  };
}

async function main(): Promise<void> {
  const outputDirectory = path.resolve(process.argv[2] ?? "tests/fixtures");
  const session = await openInstagramSession({ headless: true });
  try {
    const captured = redactPayloads(await captureInstagramPayloads(session));
    const { metadata, files } = buildFixtureMetadata(captured, new Date());
    await mkdir(outputDirectory, { recursive: true });
    for (const [name, body] of [...files, [METADATA_FILE_NAME, metadata]] as const) {
      // oxlint-disable-next-line no-await-in-loop -- A handful of small files.
      await writeFile(path.join(outputDirectory, name), `${JSON.stringify(body, null, 2)}\n`);
    }
    process.stdout.write(
      `captured ${metadata.capturedAt}: ${metadata.files.map(({ name }) => name).join(", ")}\n`,
    );
  } finally {
    await closeInstagramSession(session);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
