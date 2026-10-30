import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { closeInstagramSession, openInstagramSession } from "../sdk/lib/playwright-service.ts";
import { isJsonObject, JsonValueSchema } from "../sdk/lib/json-value.ts";
import type { JsonObject, JsonValue } from "../sdk/lib/json-value.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

// Keys whose values identify a person, a story, a place or a request; each distinct value gets a
// stable synthetic one. Any key ending in id, ids, pk or fbid is treated the same way.
const IDENTIFIER_KEYS = new Set([
  "client_cache_key",
  "code",
  "mezql_token",
  "organic_tracking_token",
  "strong_id__",
]);
const IDENTIFIER_KEY_PATTERN = /(?:^|_)(?:fbid|id|ids|pk)(?:__)?$/u;
const LATITUDE_KEY_PATTERN = /(?:^|_)(?:lat|latitude)$/u;
const LONGITUDE_KEY_PATTERN = /(?:^|_)(?:lng|lon|longitude)$/u;
const SLUG_KEY_PATTERN = /(?:^|_)slug$/u;
// Keys whose string values are structural (enums, fixed labels), so they carry no personal data.
const STRUCTURAL_KEYS = new Set([
  "__typename",
  "created_at",
  "gen_ai_detection_method",
  "logging_mechanism",
  "logging_surface",
  "media_type",
  "product_type",
  "reel_type",
  "report_name",
  "status",
  "sticker_type",
  "type",
]);
// Public music asset metadata of licensed catalog tracks is recorded as is. The music sticker and
// the music asset response both carry it under `music_asset_info`. Only these direct scalar fields
// are kept: the people around the track (artist account, profile pictures, usernames) and every URL
// stay redacted. Original (user-made) audio is not public catalog data: its title and display
// artist are usually the creator's name, so they are replaced (see isLicensedCatalogTrack).
const MUSIC_ASSET_INFO_KEY = "music_asset_info";
const PUBLIC_AUDIO_KEYS = new Set([
  "audio_asset_id",
  "audio_asset_start_time_in_ms",
  "audio_cluster_id",
  "display_artist",
  "duration_in_ms",
  "has_lyrics",
  "highlight_start_times_in_ms",
  "is_explicit",
  "overlap_duration_in_ms",
  "should_mute_audio",
  "title",
]);
// Human-readable audio text; only kept for licensed catalog tracks.
const AUDIO_TEXT_KEYS = new Set(["display_artist", "title"]);
// Any of these present on music asset info marks the audio as user-made, so its text is replaced.
const ORIGINAL_AUDIO_KEYS = [
  "is_original",
  "is_original_audio",
  "is_original_sound",
  "original_audio_title",
  "original_sound_info",
];
const MIN_ACCOUNT_NAME_LENGTH = 3;
// Free text, and a manifest full of media URLs, that tests do not need.
const OMITTED_KEYS = new Set(["video_dash_manifest", "caption", "accessibility_caption"]);
const FIXTURE_ID_BASE = 700_000_000_000_000n;
const CAPTURED_REEL_COUNT = 3;
const METADATA_FILE_NAME = "capture-metadata.json";
const LATITUDE_STEPS = 600;
const LONGITUDE_STEPS = 1600;
// What the redactor writes. The fixture privacy guard accepts these shapes and nothing else, so
// the redaction rules above stay the single source of truth for what counts as synthetic.
const SYNTHETIC_ID_PATTERN = /^7000000\d{8}$/u;
const SYNTHETIC_USERNAME_PATTERN = /^user_\d{3,}$/u;
const SYNTHETIC_AUDIO_TEXT_PATTERN = /^Fixture audio (?:title|artist) \d+$/u;
// Hand-written fixtures: "fixture" followed by words and a number, e.g. `Fixture caption 1`,
// `Fixture "quoted" 2`, `fixture_user_1` or `images/avatars/fixture-avatar-1.jpg`, optionally after a
// `kind:` prefix.
const SYNTHETIC_MARKER_PATTERN =
  /^(?:[a-z-]+\/)*(?:[a-z]+:)?fixture[\s_-](?:"?[a-z]+"?[\s_-])*\d+(?:\.[a-z0-9]+)?$/iu;
// Hosts that can never serve real data: IANA reserved example domains.
const RESERVED_HOST_PATTERN = /(?:^|\.)example\.(?:com|org|net|test)$|\.test$/u;
const MAX_COORDINATE_DECIMALS = 1;
const LATITUDE_RANGE = { max: 70, min: 10 };
const LONGITUDE_RANGE = { max: 170, min: 10 };

function anonymizedUrl(index: number): string {
  return `https://example.com/anonymized/instagram-media-${String(index).padStart(4, "0")}.jpg`;
}

function isIdentifierKey(key: string): boolean {
  return IDENTIFIER_KEYS.has(key) || IDENTIFIER_KEY_PATTERN.test(key);
}

function isPublicAudioValue(value: JsonValue): boolean {
  return Array.isArray(value)
    ? value.every((entry) => !Array.isArray(entry) && !isJsonObject(entry))
    : !isJsonObject(value);
}

function normalizedName(text: string): string {
  return text.trim().toLowerCase();
}

// Usernames and full names found anywhere in a payload, to spot audio text that names a person.
function collectAccountNames(value: JsonValue, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectAccountNames(entry, names);
    }
  } else if (isJsonObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const text = z.string().safeParse(entry);
      if ((key === "username" || key === "full_name") && text.success) {
        const name = normalizedName(text.data);
        if (name.length >= MIN_ACCOUNT_NAME_LENGTH) {
          names.add(name);
        }
      } else {
        collectAccountNames(entry, names);
      }
    }
  }
  return names;
}

/**
 * Whether music asset info is clearly a licensed catalog track, the only audio whose title and
 * display artist are public. Default-deny: the info must say explicitly that it is not original
 * sound (`is_original_sound: false`), carry no other original-audio marker, and its title and
 * display artist must not contain any username or full name found in the same payload. A missing
 * or ambiguous indicator means the audio is treated as user-made.
 */
function isLicensedCatalogTrack(info: JsonObject, accountNames: ReadonlySet<string>): boolean {
  if (info.is_original_sound !== false) {
    return false;
  }
  const markedOriginal = ORIGINAL_AUDIO_KEYS.some(
    (key) =>
      key !== "is_original_sound" &&
      Object.hasOwn(info, key) &&
      info[key] !== null &&
      info[key] !== false,
  );
  if (markedOriginal) {
    return false;
  }
  const texts = [info.title, info.display_artist]
    .map((text) => z.string().safeParse(text))
    .flatMap((text) => (text.success ? [normalizedName(text.data)] : []));
  return texts.every((text) => [...accountNames].every((name) => !text.includes(name)));
}

/**
 * Replaces everything that could identify someone while keeping the payload's shape.
 * Redaction is default-deny: every string is replaced unless its key is known to be structural,
 * and places lose their names, addresses, ids, slugs and coordinates. The one exception is public
 * music asset metadata of licensed catalog tracks (see PUBLIC_AUDIO_KEYS); original audio gets a
 * synthetic title and display artist because they are usually the creator's name.
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
    if (isIdentifierKey(key)) {
      return replacement("id", text, (index) => String(FIXTURE_ID_BASE + BigInt(index)));
    }
    if (STRUCTURAL_KEYS.has(key) || text.length === 0) {
      return text;
    }
    if (key === "username") {
      return replacement("username", text, (index) => `user_${String(index).padStart(3, "0")}`);
    }
    if (SLUG_KEY_PATTERN.test(key)) {
      return replacement("slug", text, (index) => `fixture-slug-${index}`);
    }
    if (/^https?:\/\//u.test(text)) {
      return replacement("url", text, anonymizedUrl);
    }
    return replacement("text", text, (index) => `Fixture text ${index}`);
  }

  // Synthetic coordinates are derived from the order of first appearance, never from the original.
  function redactCoordinate(original: number, key: string): number | null {
    if (LATITUDE_KEY_PATTERN.test(key)) {
      return Number(
        replacement("latitude", String(original), (index) =>
          (10 + (index % LATITUDE_STEPS) / 10).toFixed(1),
        ),
      );
    }
    if (LONGITUDE_KEY_PATTERN.test(key)) {
      return Number(
        replacement("longitude", String(original), (index) =>
          (10 + (index % LONGITUDE_STEPS) / 10).toFixed(1),
        ),
      );
    }
    return null;
  }

  // Synthetic stand-in for the title or display artist of audio that is not a licensed track.
  function redactAudioText(entry: JsonValue, kind: string): JsonValue {
    if (Array.isArray(entry)) {
      return entry.map((item) => redactAudioText(item, kind));
    }
    const text = z.string().safeParse(entry);
    return text.success && text.data.length > 0
      ? replacement(`audio-${kind}`, text.data, (index) => `Fixture audio ${kind} ${index}`)
      : entry;
  }

  // Kept public fields: licensed tracks keep their text, other audio gets synthetic text.
  function publicAudioEntry(
    info: JsonObject,
    entryKey: string,
    entry: JsonValue,
    names: ReadonlySet<string>,
  ): JsonValue {
    if (!AUDIO_TEXT_KEYS.has(entryKey) || isLicensedCatalogTrack(info, names)) {
      return entry;
    }
    return redactAudioText(entry, entryKey === "title" ? "title" : "artist");
  }

  function redact(value: JsonValue, key: string, names: ReadonlySet<string>): JsonValue {
    if (Array.isArray(value)) {
      return value.map((entry) => redact(entry, key, names));
    }
    if (isJsonObject(value)) {
      const isMusicInfo = key === MUSIC_ASSET_INFO_KEY;
      return Object.fromEntries(
        Object.entries(value)
          .filter(([entryKey]) => !OMITTED_KEYS.has(entryKey))
          .map(([entryKey, entry]) => [
            entryKey,
            isMusicInfo && PUBLIC_AUDIO_KEYS.has(entryKey) && isPublicAudioValue(entry)
              ? publicAudioEntry(value, entryKey, entry, names)
              : redact(entry, entryKey, names),
          ]),
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
    const coordinate = redactCoordinate(number.data, key);
    if (coordinate !== null) {
      return coordinate;
    }
    return isIdentifierKey(key) ? Number(redactText(String(number.data), key)) : number.data;
  }

  return (payload: JsonValue) => redact(payload, "", collectAccountNames(payload));
}

export interface UnsafeFixtureValue {
  /** Where the value sits, e.g. `data.items[0].username`. Never the value itself. */
  path: string;
  reason: string;
}

function isSyntheticUrl(text: string): boolean {
  const url = globalThis.URL.parse(text);
  return url !== null && RESERVED_HOST_PATTERN.test(url.hostname);
}

function isSyntheticText(text: string): boolean {
  return SYNTHETIC_MARKER_PATTERN.test(text) || isSyntheticUrl(text);
}

function isSyntheticCoordinate(value: number, range: { max: number; min: number }): boolean {
  const decimals = (String(value).split(".")[1] ?? "").length;
  return value >= range.min && value < range.max && decimals <= MAX_COORDINATE_DECIMALS;
}

function numberProblem(value: number, key: string): string | null {
  if (LATITUDE_KEY_PATTERN.test(key) && !isSyntheticCoordinate(value, LATITUDE_RANGE)) {
    return "latitude is not a synthetic coordinate";
  }
  if (LONGITUDE_KEY_PATTERN.test(key) && !isSyntheticCoordinate(value, LONGITUDE_RANGE)) {
    return "longitude is not a synthetic coordinate";
  }
  return isIdentifierKey(key) && !SYNTHETIC_ID_PATTERN.test(String(value))
    ? "identifier is not synthetic"
    : null;
}

// Why a string at `key` is not safe to commit, or null when it is structural, synthetic or public.
function textProblem(text: string, key: string): string | null {
  if (text.length === 0 || STRUCTURAL_KEYS.has(key)) {
    return null;
  }
  if (OMITTED_KEYS.has(key)) {
    return "free text that fixtures must omit";
  }
  if (isIdentifierKey(key)) {
    return SYNTHETIC_ID_PATTERN.test(text) || isSyntheticText(text)
      ? null
      : "identifier is not synthetic";
  }
  if (key === "username") {
    return SYNTHETIC_USERNAME_PATTERN.test(text) || isSyntheticText(text)
      ? null
      : "username is not synthetic";
  }
  return isSyntheticText(text) ? null : "text is not synthetic";
}

// Object keys can carry ids too (maps keyed by reel or user id).
function keyProblem(entryKey: string): string | null {
  return /^\d{6,}$/u.test(entryKey) && !SYNTHETIC_ID_PATTERN.test(entryKey)
    ? "object key is an identifier that is not synthetic"
    : null;
}

/**
 * Lists every value of a fixture payload that is neither structural (known enum-like keys,
 * numbers, booleans), synthetic (what `createRedactor` writes, or an explicit `fixture` marker),
 * nor public audio metadata of a licensed catalog track. It applies the redactor's own rules in
 * reverse and never reports the offending value, only where it is.
 */
export function findUnsafeFixtureValues(payload: JsonValue): Array<UnsafeFixtureValue> {
  const names = collectAccountNames(payload);
  const unsafe: Array<UnsafeFixtureValue> = [];

  function audioProblem(info: JsonObject, entryKey: string, entry: string): string | null {
    if (AUDIO_TEXT_KEYS.has(entryKey)) {
      return SYNTHETIC_AUDIO_TEXT_PATTERN.test(entry) || isLicensedCatalogTrack(info, names)
        ? null
        : "audio text of a track that is not a licensed catalog track";
    }
    return /^\d+$/u.test(entry) ? null : "audio metadata is not an identifier or a number";
  }

  function problemOf(value: JsonValue, key: string, parent: JsonObject | null): string | null {
    const text = z.string().safeParse(value);
    const number = z.number().safeParse(value);
    if (parent !== null) {
      // Public audio metadata: numbers and booleans are kept as recorded.
      return text.success ? audioProblem(parent, key, text.data) : null;
    }
    if (text.success) {
      return textProblem(text.data, key);
    }
    return number.success ? numberProblem(number.data, key) : null;
  }

  function visit(
    value: JsonValue,
    key: string,
    at: string,
    publicAudioOf: JsonObject | null,
  ): void {
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) {
        visit(entry, key, `${at}[${index}]`, publicAudioOf);
      }
      return;
    }
    if (isJsonObject(value)) {
      for (const [entryKey, entry] of Object.entries(value)) {
        const entryAt = `${at}.${entryKey}`;
        const problem = keyProblem(entryKey);
        if (problem !== null) {
          unsafe.push({ path: entryAt, reason: problem });
        }
        // Only direct scalar fields of music asset info are public, like in `redact`.
        const isPublicAudio =
          key === MUSIC_ASSET_INFO_KEY &&
          PUBLIC_AUDIO_KEYS.has(entryKey) &&
          isPublicAudioValue(entry);
        visit(entry, entryKey, entryAt, isPublicAudio ? value : null);
      }
      return;
    }
    const problem = problemOf(value, key, publicAudioOf);
    if (problem !== null) {
      unsafe.push({ path: at, reason: problem });
    }
  }

  visit(payload, "", "$", null);
  return unsafe;
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
    files.push([
      "instagram-place.json",
      payloads.place,
      "One tagged place lookup response. Place names, addresses, ids, slugs and coordinates are synthetic.",
    ]);
  }
  if (payloads.musicAsset !== null) {
    files.push([
      "instagram-music-asset.json",
      payloads.musicAsset,
      "One music asset lookup response. Asset ids and durations are kept as recorded; titles and artists are kept only for licensed catalog tracks and are synthetic for original audio; people and URLs are synthetic.",
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
    const refused = files.flatMap(([name, body]) =>
      findUnsafeFixtureValues(body).map(({ path: at, reason }) => `${name} ${at}: ${reason}`),
    );
    if (refused.length > 0) {
      throw new Error(`Refusing to write fixtures with unsafe values:\n${refused.join("\n")}`);
    }
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
