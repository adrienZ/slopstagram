import { createStorage, prefixStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import type {
  CacheStorageSet,
  StoriesManifestReport,
  StoryItem,
} from "./types.ts";

export const BASE_CACHE_DIR = ".tmp";
export const REPORTS_STORAGE_DIR = "reports";
export const STRAY_STORAGE_DIR = "stray";
export const STORIES_STORAGE_DIR = STRAY_STORAGE_DIR;

export const baseStorage = createStorage({
  driver: fsDriver({
    base: BASE_CACHE_DIR,
  }),
});

export function createCacheStorages(
  storage: Storage = baseStorage,
): CacheStorageSet {
  const strayStorage = prefixStorage<StoryItem>(storage, STRAY_STORAGE_DIR);

  return {
    reportsStorage: prefixStorage<StoriesManifestReport>(
      storage,
      REPORTS_STORAGE_DIR,
    ),
    storiesStorage: strayStorage,
    strayStorage,
  };
}

export function getStoryCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export const { reportsStorage, storiesStorage, strayStorage } =
  createCacheStorages();
