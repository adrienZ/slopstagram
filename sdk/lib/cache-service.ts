import { createStorage, prefixStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";
import type {
  AppleCaptionCacheEntry,
  CacheStorageSet,
  UserSummaryCacheEntry,
  VisionCacheEntry,
  StoriesManifestReport,
  StoryItem,
} from "./types.ts";

export const BASE_CACHE_DIR = ".tmp";
const APPLE_CAPTIONS_STORAGE_DIR = "apple-captions";
export const IMAGES_STORAGE_DIR = "images";
const USER_SUMMARIES_STORAGE_DIR = "user-summaries";
const VISION_STORAGE_DIR = "vision";
export const REPORTS_STORAGE_DIR = "reports";
const STORIES_STORAGE_DIR = "stories";

const baseStorage = createStorage({
  // oxlint-disable-next-line typescript/no-unsafe-assignment unstorage drivers use any
  driver: fsDriver({
    base: BASE_CACHE_DIR,
  }),
});

export function createCacheStorages(storage: Storage = baseStorage): CacheStorageSet {
  return {
    appleCaptionsStorage: prefixStorage<AppleCaptionCacheEntry>(
      storage,
      APPLE_CAPTIONS_STORAGE_DIR,
    ),
    imageCacheStorage: prefixStorage<Record<string, never>>(storage, IMAGES_STORAGE_DIR),
    userSummaryStorage: prefixStorage<UserSummaryCacheEntry>(storage, USER_SUMMARIES_STORAGE_DIR),
    visionStorage: prefixStorage<VisionCacheEntry>(storage, VISION_STORAGE_DIR),
    reportsStorage: prefixStorage<StoriesManifestReport>(storage, REPORTS_STORAGE_DIR),
    storiesStorage: prefixStorage<StoryItem>(storage, STORIES_STORAGE_DIR),
  };
}

export function getMediaCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export function getUserSummaryCacheKey(sourceHash: string): string {
  return `${sourceHash}.json`;
}

export const {
  appleCaptionsStorage,
  imageCacheStorage,
  userSummaryStorage,
  visionStorage,
  reportsStorage,
  storiesStorage,
} = createCacheStorages();
