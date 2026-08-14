import { createStorage, prefixStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";
import { APP_CACHE_DIR } from "./app-data-paths.ts";
import type { CacheStorageSet, StoriesManifestReport, StoryItem } from "./types.ts";

export const BASE_CACHE_DIR = APP_CACHE_DIR;
export const IMAGES_STORAGE_DIR = "images";
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
    imageCacheStorage: prefixStorage<Record<string, never>>(storage, IMAGES_STORAGE_DIR),
    reportsStorage: prefixStorage<StoriesManifestReport>(storage, REPORTS_STORAGE_DIR),
    storiesStorage: prefixStorage<StoryItem>(storage, STORIES_STORAGE_DIR),
  };
}

export function getMediaCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export const { imageCacheStorage, reportsStorage, storiesStorage } = createCacheStorages();
