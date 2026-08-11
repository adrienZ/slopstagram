import process from "node:process";
import { pathToFileURL } from "node:url";
import { recognizeAppleCaption } from "./lib/apple-ocr-service.ts";
import {
  getMediaCacheKey,
  storiesStorage,
} from "./lib/cache-service.ts";
import { createLogger, type Logger } from "./lib/logging-service.ts";
import { getLargestVersion } from "./lib/parser-service.ts";
import {
  NO_ACCESSIBILITY_CAPTION,
  NO_APPLE_CAPTION,
} from "./lib/report-constants.ts";
import {
  closeInstagramSession,
  openInstagramSession,
  type InstagramSession,
} from "./lib/playwright-service.ts";
import { STORY_MEDIA_TYPES } from "./lib/types.ts";
import type {
  StoriesManifestReport,
  StoryFetchFailure,
  StoryFetchFailureReason,
  StoryItem,
  StoryMediaType,
  StoryManifestReel,
  StoryManifestItem,
  StoryOutputUser,
  StoryReel,
  StoryStorage,
  StoryTrayEntry,
} from "./lib/types.ts";

type ReelTrayResponse = {
  broadcasts: unknown[];
  story_ranking_token: string;
  status: string;
  tray: StoryTrayEntry[];
};

type ReelsMediaResponse = {
  reels?: Record<string, StoryReel>;
  reels_media?: Record<string, StoryReel>;
  status?: string | null;
};

export type InstagramClientResponse<T> = {
  headers: Record<string, string>;
  json: () => Promise<T>;
  ok: boolean;
  status: number;
};

export type InstagramClient = {
  getReelsMedia: (
    reelIds: string[],
  ) => Promise<InstagramClientResponse<ReelsMediaResponse>>;
  getTray: () => Promise<InstagramClientResponse<ReelTrayResponse>>;
};

type RequestFailure = {
  attemptCount: number;
  message: string;
  reason: "request_failed" | "rate_limited";
  status: number | null;
};

type RequestResult<T> =
  | {
      value: T;
      ok: true;
    }
  | {
      failure: RequestFailure;
      ok: false;
    };

export type FetchStoriesManifestOptions = {
  appleCaptionResolver?: (story: StoryItem) => Promise<string>;
  baseDelayMs?: number;
  maxAttempts?: number;
  maxRateLimitDelayMs?: number;
  now?: () => Date;
  random?: () => number;
  reelIdsPerRequest?: number;
  reportName?: string;
  logger?: Logger;
  sleep?: (durationMs: number) => Promise<void>;
  storyStorage?: StoryStorage;
};

type FetchStoriesOptions = FetchStoriesManifestOptions & {
  client?: InstagramClient;
  closeSession?: typeof closeInstagramSession;
  openSession?: typeof openInstagramSession;
};

const IG_APP_ID = "936619743392459";
const REELS_TRAY_URL = "https://www.instagram.com/api/v1/feed/reels_tray/";
const REELS_MEDIA_URL = "https://www.instagram.com/api/v1/feed/reels_media/";
const DEFAULT_REPORT_NAME = "stories-report.json";
const DEFAULT_REEL_IDS_PER_REQUEST = 25;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_RATE_LIMIT_DELAY_MS = 10_000;
const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function getRetryAfterMs(
  headers: Record<string, string>,
  maxRateLimitDelayMs: number,
  now: Date,
): number | null {
  const retryAfter = normalizeHeaders(headers)["retry-after"];

  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(0, seconds * 1000), maxRateLimitDelayMs);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.min(Math.max(0, retryAt - now.getTime()), maxRateLimitDelayMs);
}

function getBackoffMs(
  attemptIndex: number,
  response: InstagramClientResponse<unknown> | null,
  options: Required<
    Pick<
      FetchStoriesManifestOptions,
      "baseDelayMs" | "maxRateLimitDelayMs" | "now" | "random"
    >
  >,
): number {
  const retryAfterMs =
    response && response.status === 429
      ? getRetryAfterMs(
          response.headers,
          options.maxRateLimitDelayMs,
          options.now(),
        )
      : null;

  if (retryAfterMs !== null) {
    return retryAfterMs;
  }

  const jitterMs = Math.floor(options.random() * 100);
  return options.baseDelayMs * 2 ** attemptIndex + jitterMs;
}

function createInstagramClient(session: InstagramSession): InstagramClient {
  return {
    async getReelsMedia(reelIds) {
      const query = reelIds
        .map((reelId) => `reel_ids=${encodeURIComponent(reelId)}`)
        .join("&");
      const response = await session.context.request.get(
        `${REELS_MEDIA_URL}?${query}`,
        {
          headers: {
            "x-ig-app-id": IG_APP_ID,
          },
        },
      );

      return {
        headers: response.headers(),
        json: () => response.json() as Promise<ReelsMediaResponse>,
        ok: response.ok(),
        status: response.status(),
      };
    },

    async getTray() {
      const response = await session.context.request.get(REELS_TRAY_URL, {
        headers: {
          "x-ig-app-id": IG_APP_ID,
        },
      });

      return {
        headers: response.headers(),
        json: () => response.json() as Promise<ReelTrayResponse>,
        ok: response.ok(),
        status: response.status(),
      };
    },
  };
}

function extractReels(response: ReelsMediaResponse): Record<string, StoryReel> {
  return response.reels ?? response.reels_media ?? {};
}

async function getCachedStoryItem(
  mediaPk: string,
  storyStorage: StoryStorage,
): Promise<StoryItem | null> {
  const cachedValue = await storyStorage.getItem(getMediaCacheKey(mediaPk));

  if (!cachedValue) {
    return null;
  }

  const item =
    typeof cachedValue === "string"
      ? (JSON.parse(cachedValue) as StoryItem)
      : (cachedValue as StoryItem);

  return item.pk === mediaPk ? item : null;
}

async function cacheStoryItem(
  item: StoryItem,
  storyStorage: StoryStorage,
): Promise<void> {
  await storyStorage.setItem(getMediaCacheKey(item.pk), item);
}

async function requestWithRetry<T>(
  runRequest: () => Promise<InstagramClientResponse<T>>,
  options: Required<
    Pick<
      FetchStoriesManifestOptions,
      | "baseDelayMs"
      | "logger"
      | "maxAttempts"
      | "maxRateLimitDelayMs"
      | "now"
      | "random"
      | "sleep"
    >
  >,
  label: string,
): Promise<RequestResult<T>> {
  let lastFailure: RequestFailure = {
    attemptCount: 0,
    message: "Request was not attempted",
    reason: "request_failed",
    status: null,
  };

  for (let attemptIndex = 0; attemptIndex < options.maxAttempts; attemptIndex += 1) {
    const attemptCount = attemptIndex + 1;

    try {
      const response = await runRequest();

      if (response.ok) {
        return {
          ok: true,
          value: await response.json(),
        };
      }

      const reason = response.status === 429 ? "rate_limited" : "request_failed";
      lastFailure = {
        attemptCount,
        message: `Instagram request failed with HTTP ${response.status}`,
        reason,
        status: response.status,
      };

      if (
        attemptCount >= options.maxAttempts ||
        !TRANSIENT_STATUS_CODES.has(response.status)
      ) {
        options.logger.warn(
          `${label} failed after ${attemptCount} attempt(s): ${lastFailure.message}`,
        );
        return {
          failure: lastFailure,
          ok: false,
        };
      }

      const delayMs = getBackoffMs(attemptIndex, response, options);
      options.logger.warn(
        `${label} attempt ${attemptCount} failed with HTTP ${response.status}; retrying in ${delayMs}ms`,
      );
      await options.sleep(delayMs);
    } catch (error: unknown) {
      lastFailure = {
        attemptCount,
        message: error instanceof Error ? error.message : String(error),
        reason: "request_failed",
        status: null,
      };

      if (attemptCount >= options.maxAttempts) {
        options.logger.warn(
          `${label} failed after ${attemptCount} attempt(s): ${lastFailure.message}`,
        );
        return {
          failure: lastFailure,
          ok: false,
        };
      }

      const delayMs = getBackoffMs(attemptIndex, null, options);
      options.logger.warn(
        `${label} attempt ${attemptCount} threw ${lastFailure.message}; retrying in ${delayMs}ms`,
      );
      await options.sleep(delayMs);
    }
  }

  return {
    failure: lastFailure,
    ok: false,
  };
}

function createFailure(
  reelId: string,
  mediaPk: string | null,
  failure: RequestFailure,
  reason: StoryFetchFailureReason = failure.reason,
): StoryFetchFailure {
  return {
    attempt_count: failure.attemptCount,
    http_status: failure.status,
    media_pk: mediaPk,
    message: failure.message,
    reason,
    reel_id: reelId,
  };
}

function getExpectedMediaIdsByReel(
  tray: StoryTrayEntry[],
): Map<string, string[]> {
  return new Map(tray.map((entry) => [entry.id, entry.media_ids]));
}

function getPendingMediaIds(
  reelId: string,
  expectedMediaIdsByReel: Map<string, string[]>,
  cachedItems: Map<string, StoryItem>,
): string[] {
  return (expectedMediaIdsByReel.get(reelId) ?? []).filter(
    (mediaPk) => !cachedItems.has(mediaPk),
  );
}

function addFailuresForPendingReelStories(
  reelIds: string[],
  expectedMediaIdsByReel: Map<string, string[]>,
  cachedItems: Map<string, StoryItem>,
  failures: StoryFetchFailure[],
  failureByMediaPk: Map<string, number>,
  logger: Logger,
  failure: RequestFailure,
  reason: StoryFetchFailureReason = failure.reason,
): void {
  for (const reelId of reelIds) {
    for (const mediaPk of getPendingMediaIds(
      reelId,
      expectedMediaIdsByReel,
      cachedItems,
    )) {
      if (failureByMediaPk.has(mediaPk)) {
        continue;
      }

      const failureIndex = failures.length;
      const storyFailure = createFailure(reelId, mediaPk, failure, reason);
      failures.push(storyFailure);
      failureByMediaPk.set(mediaPk, failureIndex);
      logger.error(
        `story failed: reel_id=${storyFailure.reel_id} media_pk=${storyFailure.media_pk} reason=${storyFailure.reason} status=${storyFailure.http_status ?? "none"} attempts=${storyFailure.attempt_count} message=${storyFailure.message}`,
      );
    }
  }
}

async function cacheReturnedReels(
  reels: Record<string, StoryReel>,
  cachedItems: Map<string, StoryItem>,
  fetchedMediaPks: Set<string>,
  storyStorage: StoryStorage,
): Promise<void> {
  for (const reel of Object.values(reels)) {
    for (const item of reel.items ?? []) {
      if (!item.pk || cachedItems.has(item.pk)) {
        continue;
      }

      await cacheStoryItem(item, storyStorage);
      cachedItems.set(item.pk, item);
      fetchedMediaPks.add(item.pk);
    }
  }
}

function getRemainingReelIds(
  reelIdsToFetch: string[],
  currentIndex: number,
): string[] {
  return reelIdsToFetch.slice(currentIndex);
}

function getResolvedStoryCount(
  cacheHitPks: Set<string>,
  fetchedMediaPks: Set<string>,
  failureByMediaPk: Map<string, number>,
): number {
  return cacheHitPks.size + fetchedMediaPks.size + failureByMediaPk.size;
}

function logStoryProgress(
  logger: Logger,
  expectedStories: number,
  cacheHitPks: Set<string>,
  fetchedMediaPks: Set<string>,
  failureByMediaPk: Map<string, number>,
  suffix: string,
): void {
  logger.progress(
    getResolvedStoryCount(cacheHitPks, fetchedMediaPks, failureByMediaPk),
    expectedStories,
    {
      prefix: "stories",
      suffix,
    },
  );
}

function getAccessibilityCaption(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): string {
  const caption = cachedItems.get(mediaPk)?.accessibility_caption;

  if (typeof caption === "string" && caption.trim().length > 0) {
    return caption;
  }

  return NO_ACCESSIBILITY_CAPTION;
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nested = record[key];

  if (!nested || typeof nested !== "object") {
    return null;
  }

  return nested as Record<string, unknown>;
}

function getNestedString(value: unknown, keys: readonly string[]): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function getMentionStickerLabel(value: unknown): string | null {
  const stickerData = getNestedRecord(value, "bloks_sticker");
  const bloksData = stickerData ? getNestedRecord(stickerData, "sticker_data") : null;
  const mention = bloksData ? getNestedRecord(bloksData, "ig_mention") : null;

  if (!mention) {
    return null;
  }

  const username = getNestedString(mention, ["username"]);
  if (username) {
    return `mention:@${username}`;
  }

  const fullName = getNestedString(mention, ["full_name"]);
  return fullName ? `mention:${fullName}` : null;
}

function getMusicStickerLabel(value: unknown): string | null {
  const info = getNestedRecord(value, "music_asset_info");

  if (!info) {
    return null;
  }

  const title = getNestedString(info, ["title"]);
  const artist = getNestedString(info, ["display_artist"]);

  if (title && artist) {
    return `music:${title} - ${artist}`;
  }

  return title ? `music:${title}` : null;
}

function getHashtagStickerLabel(value: unknown): string | null {
  const hashtag =
    getNestedString(value, ["hashtag", "name", "tag_name"]) ??
    getNestedString(getNestedRecord(value, "hashtag"), ["name", "tag_name"]);

  if (!hashtag) {
    return null;
  }

  return hashtag.startsWith("#") ? `hashtag:${hashtag}` : `hashtag:#${hashtag}`;
}

function unwrapInstagramRedirectUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.hostname !== "l.instagram.com") {
      return value;
    }

    const redirect = url.searchParams.get("u");
    if (!redirect) {
      return value;
    }

    return decodeURIComponent(redirect);
  } catch {
    return value;
  }
}

function getLinkStickerLabel(value: unknown): string | null {
  const rawDirectUrl = getNestedString(value, [
    "url",
    "uri",
    "link_url",
    "webUri",
    "web_uri",
  ]);
  const directUrl = rawDirectUrl ? unwrapInstagramRedirectUrl(rawDirectUrl) : null;
  const directTitle = getNestedString(value, ["title", "link_title", "display_url"]);

  if (directUrl && directTitle) {
    return `link:${directTitle} (${directUrl})`;
  }

  if (directUrl) {
    return `link:${directUrl}`;
  }

  for (const key of [
    "story_link",
    "link_sticker",
    "link",
    "cta",
    "bloks_tappable_sticker",
  ] as const) {
    const nested = getNestedRecord(value, key);
    if (!nested) {
      continue;
    }

    const nestedLabel = getLinkStickerLabel(nested);
    if (nestedLabel) {
      return nestedLabel;
    }
  }

  return directTitle ? `link:${directTitle}` : null;
}

function getLocationRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = getNestedString(record, ["name", "location_name", "title"]);
  const address = getNestedString(record, [
    "address",
    "full_address",
    "street_address",
    "subtitle",
  ]);

  if (name || address) {
    return record;
  }

  for (const key of [
    "location",
    "venue",
    "place",
    "story_location",
    "location_sticker",
    "bloks_sticker",
    "sticker_data",
  ] as const) {
    const nested = getNestedRecord(record, key);
    const nestedLocation = getLocationRecord(nested);

    if (nestedLocation) {
      return nestedLocation;
    }
  }

  return null;
}

function getLocationFromValue(value: unknown): { address: string; name: string } | null {
  const location = getLocationRecord(value);

  if (!location) {
    return null;
  }

  const name =
    getNestedString(location, ["name", "location_name", "title"]) ?? "";
  const address =
    getNestedString(location, [
      "address",
      "full_address",
      "street_address",
      "subtitle",
    ]) ?? "";

  return name || address ? { address, name } : null;
}

function formatStoryLocation(location: { address: string; name: string }): string {
  return [location.name, location.address]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

function getStoryLocationsFromItem(story: StoryItem): string[] {
  const locations: string[] = [];
  const seen = new Set<string>();

  const addLocation = (location: { address: string; name: string } | null) => {
    if (!location) {
      return;
    }

    const formattedLocation = formatStoryLocation(location);
    const key = formattedLocation.toLowerCase();

    if (!formattedLocation) {
      return;
    }

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    locations.push(formattedLocation);
  };

  for (const location of story.story_locations ?? []) {
    addLocation(getLocationFromValue(location));
  }

  for (const sticker of story.story_bloks_stickers ?? []) {
    addLocation(getLocationFromValue(sticker));
  }

  return locations;
}

function getStickerLabels(story: StoryItem): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  const addLabel = (label: string | null) => {
    if (!label || seen.has(label)) {
      return;
    }

    seen.add(label);
    labels.push(label);
  };

  for (const sticker of story.story_bloks_stickers ?? []) {
    addLabel(getMentionStickerLabel(sticker));
  }

  for (const sticker of story.story_music_stickers ?? []) {
    addLabel(getMusicStickerLabel(sticker));
  }

  for (const sticker of story.story_hashtags ?? []) {
    addLabel(getHashtagStickerLabel(sticker));
  }

  for (const sticker of story.story_link_stickers ?? []) {
    addLabel(getLinkStickerLabel(sticker));
  }

  for (const sticker of story.story_cta ?? []) {
    addLabel(getLinkStickerLabel(sticker));
  }

  for (const sticker of story.story_bloks_tappables ?? []) {
    addLabel(getLinkStickerLabel(sticker));
  }

  for (const sticker of story.text_post_share_to_ig_story_stickers ?? []) {
    addLabel(getLinkStickerLabel(sticker));
  }

  addLabel(getLinkStickerLabel(story.link));

  return labels;
}

function getStoryStickers(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): string[] {
  const story = cachedItems.get(mediaPk);

  if (!story) {
    return [];
  }

  return getStickerLabels(story);
}

function getStoryLocations(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): string[] {
  const story = cachedItems.get(mediaPk);

  if (!story) {
    return [];
  }

  return getStoryLocationsFromItem(story);
}

function getStoryPreviewImageUrl(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): string | null {
  const story = cachedItems.get(mediaPk);
  const candidate = getLargestVersion(story?.image_versions2?.candidates);

  return candidate?.url ?? null;
}

function getStoryMediaType(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): StoryMediaType | null {
  const mediaType = cachedItems.get(mediaPk)?.media_type;

  if (mediaType === 1) {
    return STORY_MEDIA_TYPES.IMAGE;
  }

  if (mediaType === 2) {
    return STORY_MEDIA_TYPES.VIDEO;
  }

  return null;
}

function createOutputUsers(manifestUsers: StoryManifestReel[]): StoryOutputUser[] {
  const outputUsers: StoryOutputUser[] = [];
  const groupByUser = new Map<string, StoryOutputUser>();

  for (const user of manifestUsers) {
    const groupKey = user.username;
    let group = groupByUser.get(groupKey);

    if (!group) {
      group = {
        full_name: user.full_name,
        profile_pic_url: user.profile_pic_url,
        reel_ids: [],
        stories: [],
        username: user.username,
      };
      groupByUser.set(groupKey, group);
      outputUsers.push(group);
    }

    group.reel_ids.push(user.reel_id);
    group.stories.push(
      ...user.stories.map((story) => ({
        apple_caption: story.apple_caption,
        ...(story.failure_index === undefined
          ? {}
          : { failure_index: story.failure_index }),
        ig_caption: story.ig_caption,
        locations: story.locations,
        media_type: story.media_type ?? null,
        media_pk: story.media_pk,
        preview_image_url: story.preview_image_url,
        stickers: story.stickers,
        status: story.status,
      })),
    );
  }

  return outputUsers;
}

async function populateAppleCaptions(
  manifestUsers: StoryManifestReel[],
  cachedItems: Map<string, StoryItem>,
  resolver: (story: StoryItem) => Promise<string>,
  logger: Logger,
): Promise<void> {
  const resolvedByMediaPk = new Map<string, string>();
  const mediaPksToResolve = new Set(
    manifestUsers.flatMap((user) =>
      user.stories
        .filter((story) => story.status !== "failed")
        .map((story) => story.media_pk),
    ),
  );
  let resolvedCount = 0;

  function updateAppleCaptionProgress(mediaPk: string, suffix: string): void {
    if (mediaPksToResolve.size === 0) {
      return;
    }

    logger.progress(resolvedCount, mediaPksToResolve.size, {
      prefix: "apple-captions",
      suffix: `${suffix} ${getMediaCacheKey(mediaPk)}`,
    });
  }

  function logAppleCaptionProgress(mediaPk: string, suffix: string): void {
    if (mediaPksToResolve.size === 0) {
      return;
    }

    resolvedCount += 1;
    updateAppleCaptionProgress(mediaPk, suffix);
  }

  for (const user of manifestUsers) {
    for (const story of user.stories) {
      if (story.status === "failed") {
        story.apple_caption = NO_APPLE_CAPTION;
        continue;
      }

      const cachedCaption = resolvedByMediaPk.get(story.media_pk);
      if (cachedCaption) {
        story.apple_caption = cachedCaption;
        continue;
      }

      const storyItem = cachedItems.get(story.media_pk);
      if (!storyItem) {
        story.apple_caption = NO_APPLE_CAPTION;
        resolvedByMediaPk.set(story.media_pk, story.apple_caption);
        logAppleCaptionProgress(story.media_pk, "missing");
        continue;
      }

      try {
        updateAppleCaptionProgress(story.media_pk, "resolving");
        const appleCaption = await resolver(storyItem);
        resolvedByMediaPk.set(story.media_pk, appleCaption);
        story.apple_caption = appleCaption;
        logAppleCaptionProgress(story.media_pk, "resolved");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`apple ocr failed for story ${story.media_pk}: ${message}`);
        story.apple_caption = NO_APPLE_CAPTION;
        resolvedByMediaPk.set(story.media_pk, story.apple_caption);
        logAppleCaptionProgress(story.media_pk, "failed");
      }
    }
  }
}

export async function fetchStoriesManifest(
  client: InstagramClient,
  options: FetchStoriesManifestOptions = {},
): Promise<StoriesManifestReport> {
  const reportName = options.reportName ?? DEFAULT_REPORT_NAME;
  const storyStorage = options.storyStorage ?? storiesStorage;
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? createLogger("fetch-stories");
  const appleCaptionResolver = options.appleCaptionResolver ?? recognizeAppleCaption;
  const retryOptions = {
    baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    logger,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    maxRateLimitDelayMs:
      options.maxRateLimitDelayMs ?? DEFAULT_MAX_RATE_LIMIT_DELAY_MS,
    now,
    random: options.random ?? Math.random,
    sleep: options.sleep ?? sleep,
  };
  const reelIdsPerRequest =
    options.reelIdsPerRequest ?? DEFAULT_REEL_IDS_PER_REQUEST;

  logger.info(`fetching tray for report ${reportName}`);
  const trayResult = await requestWithRetry(
    () => client.getTray(),
    retryOptions,
    "reels tray request",
  );

  if (!trayResult.ok) {
    logger.error(`tray fetch failed: ${trayResult.failure.message}`);
    throw new Error(trayResult.failure.message);
  }

  const trayJson = trayResult.value;
  const tray = trayJson.tray;
  const expectedMediaIdsByReel = getExpectedMediaIdsByReel(tray);
  const expectedMediaPks = tray.flatMap((entry) => entry.media_ids);
  const cachedItems = new Map<string, StoryItem>();
  const cacheHitPks = new Set<string>();
  const fetchedMediaPks = new Set<string>();
  const failures: StoryFetchFailure[] = [];
  const failureByMediaPk = new Map<string, number>();

  logger.info(
    `tray fetched: reels=${tray.length} stories=${expectedMediaPks.length} status=${trayJson.status}`,
  );

  for (const mediaPk of new Set(expectedMediaPks)) {
    const cachedItem = await getCachedStoryItem(mediaPk, storyStorage);

    if (cachedItem) {
      cachedItems.set(mediaPk, cachedItem);
      cacheHitPks.add(mediaPk);
    }
  }

  const cacheMissCount = expectedMediaPks.filter(
    (mediaPk) => !cacheHitPks.has(mediaPk),
  ).length;
  logger.info(
    `story cache loaded: hits=${cacheHitPks.size} misses=${cacheMissCount}`,
  );
  logStoryProgress(
    logger,
    expectedMediaPks.length,
    cacheHitPks,
    fetchedMediaPks,
    failureByMediaPk,
    `cache hits=${cacheHitPks.size} misses=${cacheMissCount}`,
  );

  const reelIdsToFetch = tray
    .filter((entry) =>
      entry.media_ids.some((mediaPk) => !cachedItems.has(mediaPk)),
    )
    .map((entry) => entry.id);

  if (reelIdsToFetch.length === 0) {
    logger.info("all expected stories were found in cache");
  } else {
    logger.info(
      `fetching missing stories from ${reelIdsToFetch.length} reel(s)`,
    );
  }

  let liveFetchStopped = false;
  let reelIndex = 0;
  const reelChunks = chunk(reelIdsToFetch, reelIdsPerRequest);

  for (let chunkIndex = 0; chunkIndex < reelChunks.length; chunkIndex += 1) {
    if (liveFetchStopped) {
      break;
    }

    const idChunk = reelChunks[chunkIndex] ?? [];
    logStoryProgress(
      logger,
      expectedMediaPks.length,
      cacheHitPks,
      fetchedMediaPks,
      failureByMediaPk,
      `fetching reel chunk ${chunkIndex + 1}/${reelChunks.length} reels=${idChunk.length}`,
    );
    const chunkResult = await requestWithRetry(
      () => client.getReelsMedia(idChunk),
      retryOptions,
      `reels media chunk ${chunkIndex + 1}/${reelChunks.length}`,
    );

    if (chunkResult.ok) {
      const fetchedBefore = fetchedMediaPks.size;
      await cacheReturnedReels(
        extractReels(chunkResult.value),
        cachedItems,
        fetchedMediaPks,
        storyStorage,
      );

      addFailuresForPendingReelStories(
        idChunk,
        expectedMediaIdsByReel,
        cachedItems,
        failures,
        failureByMediaPk,
        logger,
        {
          attemptCount: 1,
          message: "Expected story was missing from Instagram reels response",
          reason: "request_failed",
          status: null,
        },
        "missing_from_response",
      );
      logStoryProgress(
        logger,
        expectedMediaPks.length,
        cacheHitPks,
        fetchedMediaPks,
        failureByMediaPk,
        `reel chunk ${chunkIndex + 1}/${reelChunks.length} cached ${fetchedMediaPks.size - fetchedBefore}`,
      );
      reelIndex += idChunk.length;
      continue;
    }

    if (chunkResult.failure.reason === "rate_limited") {
      logger.warn(
        `rate limited while fetching chunk ${chunkIndex + 1}; marking remaining missing stories as rate_limited`,
      );
      addFailuresForPendingReelStories(
        getRemainingReelIds(reelIdsToFetch, reelIndex),
        expectedMediaIdsByReel,
        cachedItems,
        failures,
        failureByMediaPk,
        logger,
        chunkResult.failure,
        "rate_limited",
      );
      logStoryProgress(
        logger,
        expectedMediaPks.length,
        cacheHitPks,
        fetchedMediaPks,
        failureByMediaPk,
        `rate limited chunk ${chunkIndex + 1}`,
      );
      liveFetchStopped = true;
      break;
    }

    logger.warn(
      `chunk ${chunkIndex + 1}/${reelChunks.length} failed; falling back to individual reel requests`,
    );
    for (const reelId of idChunk) {
      logStoryProgress(
        logger,
        expectedMediaPks.length,
        cacheHitPks,
        fetchedMediaPks,
        failureByMediaPk,
        `fetching reel ${reelId}`,
      );
      const singleResult = await requestWithRetry(
        () => client.getReelsMedia([reelId]),
        retryOptions,
        `reels media request for reel ${reelId}`,
      );

      if (singleResult.ok) {
        const fetchedBefore = fetchedMediaPks.size;
        await cacheReturnedReels(
          extractReels(singleResult.value),
          cachedItems,
          fetchedMediaPks,
          storyStorage,
        );

        addFailuresForPendingReelStories(
          [reelId],
          expectedMediaIdsByReel,
          cachedItems,
          failures,
          failureByMediaPk,
          logger,
          {
            attemptCount: 1,
            message: "Expected story was missing from Instagram reels response",
            reason: "request_failed",
            status: null,
          },
          "missing_from_response",
        );
        logStoryProgress(
          logger,
          expectedMediaPks.length,
          cacheHitPks,
          fetchedMediaPks,
          failureByMediaPk,
          `reel ${reelId} cached ${fetchedMediaPks.size - fetchedBefore}`,
        );
        reelIndex += 1;
        continue;
      }

      if (singleResult.failure.reason === "rate_limited") {
        logger.warn(
          `rate limited while fetching reel ${reelId}; marking remaining missing stories as rate_limited`,
        );
        addFailuresForPendingReelStories(
          getRemainingReelIds(reelIdsToFetch, reelIndex),
          expectedMediaIdsByReel,
          cachedItems,
          failures,
          failureByMediaPk,
          logger,
          singleResult.failure,
          "rate_limited",
        );
        logStoryProgress(
          logger,
          expectedMediaPks.length,
          cacheHitPks,
          fetchedMediaPks,
          failureByMediaPk,
          `rate limited reel ${reelId}`,
        );
        liveFetchStopped = true;
        break;
      }

      logger.warn(
        `individual reel ${reelId} failed: ${singleResult.failure.message}`,
      );
      addFailuresForPendingReelStories(
        [reelId],
        expectedMediaIdsByReel,
        cachedItems,
        failures,
        failureByMediaPk,
        logger,
        singleResult.failure,
      );
      logStoryProgress(
        logger,
        expectedMediaPks.length,
        cacheHitPks,
        fetchedMediaPks,
        failureByMediaPk,
        `reel ${reelId} failed`,
      );
      reelIndex += 1;
    }
  }

  const manifestUsers: StoryManifestReel[] = tray.map((entry, order) => ({
    full_name: entry.user.full_name ?? entry.full_name ?? null,
    media_ids: entry.media_ids,
    order,
    profile_pic_url: entry.user.profile_pic_url ?? null,
    reel_id: entry.id,
    stories: entry.media_ids.map((mediaPk): StoryManifestItem => {
      const failureIndex = failureByMediaPk.get(mediaPk);
      return {
        apple_caption: NO_APPLE_CAPTION,
        cache_key: getMediaCacheKey(mediaPk),
        ...(failureIndex === undefined ? {} : { failure_index: failureIndex }),
        ig_caption: getAccessibilityCaption(mediaPk, cachedItems),
        locations: getStoryLocations(mediaPk, cachedItems),
        media_type: getStoryMediaType(mediaPk, cachedItems),
        media_pk: mediaPk,
        preview_image_url: getStoryPreviewImageUrl(mediaPk, cachedItems),
        stickers: getStoryStickers(mediaPk, cachedItems),
        status:
          failureIndex !== undefined
            ? ("failed" as const)
            : ("ok" as const),
      };
    }),
    username: entry.user.username,
  }));
  logger.info(`resolving apple captions for ${expectedMediaPks.length - failureByMediaPk.size} story item(s)`);
  await populateAppleCaptions(
    manifestUsers,
    cachedItems,
    appleCaptionResolver,
    logger,
  );
  const outputUsers = createOutputUsers(manifestUsers);

  logger.info(
    `manifest complete: cached=${cacheHitPks.size} fetched=${fetchedMediaPks.size} failed=${failureByMediaPk.size}`,
  );

  return {
    failures,
    manifest: {
      users: manifestUsers,
    },
    metadata: {
      broadcasts_count: trayJson.broadcasts.length,
      counts: {
        cache_hits: expectedMediaPks.filter((mediaPk) =>
          cacheHitPks.has(mediaPk),
        ).length,
        cache_misses: expectedMediaPks.filter(
          (mediaPk) => !cacheHitPks.has(mediaPk),
        ).length,
        failed: expectedMediaPks.filter((mediaPk) =>
          failureByMediaPk.has(mediaPk),
        ).length,
        fetched: expectedMediaPks.filter((mediaPk) =>
          fetchedMediaPks.has(mediaPk),
        ).length,
        reels: tray.length,
        stories: expectedMediaPks.length,
      },
      created_at: now().toISOString(),
      report_name: reportName,
      status: trayJson.status,
      story_ranking_token: trayJson.story_ranking_token,
    },
    output: {
      users: outputUsers,
    },
  };
}

export async function fetchStories(
  args: string[] = process.argv.slice(2),
  options: FetchStoriesOptions = {},
): Promise<StoriesManifestReport> {
  const reportName =
    options.reportName ?? getArgValue(args, "--report-name") ?? DEFAULT_REPORT_NAME;

  if (options.client) {
    return fetchStoriesManifest(options.client, {
      ...options,
      reportName,
    });
  }

  const openSession = options.openSession ?? openInstagramSession;
  const closeSession = options.closeSession ?? closeInstagramSession;
  const session = await openSession();

  try {
    return await fetchStoriesManifest(createInstagramClient(session), {
      ...options,
      reportName,
    });
  } finally {
    await closeSession(session);
  }
}

async function main(): Promise<void> {
  const logger = createLogger("fetch-stories");
  const payload = await fetchStories(process.argv.slice(2), { logger });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
