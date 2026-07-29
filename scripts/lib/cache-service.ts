import { createStorage, prefixStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import type {
  AppleCaptionCacheEntry,
  CacheStorageSet,
  StoriesManifestReport,
  StoryItem,
} from "./types.ts";

export const BASE_CACHE_DIR = ".tmp";
export const APPLE_CAPTIONS_STORAGE_DIR = "apple-captions";
export const REPORTS_STORAGE_DIR = "reports";
export const STORIES_STORAGE_DIR = "stories";

export const baseStorage = createStorage({
  driver: fsDriver({
    base: BASE_CACHE_DIR,
  }),
});

export function createCacheStorages(
  storage: Storage = baseStorage,
): CacheStorageSet {
  return {
    appleCaptionsStorage: prefixStorage<AppleCaptionCacheEntry>(
      storage,
      APPLE_CAPTIONS_STORAGE_DIR,
    ),
    reportsStorage: prefixStorage<StoriesManifestReport>(
      storage,
      REPORTS_STORAGE_DIR,
    ),
    storiesStorage: prefixStorage<StoryItem>(storage, STORIES_STORAGE_DIR),
  };
}

export function getStoryCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export function getAppleCaptionCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export const { appleCaptionsStorage, reportsStorage, storiesStorage } =
  createCacheStorages();
