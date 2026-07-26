import { createStorage, prefixStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";

export const BASE_CACHE_DIR = ".tmp";
export const STRAY_STORAGE_DIR = "stray";
export const STORIES_STORAGE_DIR = "stories";

export const baseStorage = createStorage({
  driver: fsDriver({
    base: BASE_CACHE_DIR,
  }),
});

export function createCacheStorages(storage = baseStorage): {
  storiesStorage: typeof baseStorage;
  strayStorage: typeof baseStorage;
} {
  return {
    storiesStorage: prefixStorage(storage, STORIES_STORAGE_DIR),
    strayStorage: prefixStorage(storage, STRAY_STORAGE_DIR),
  };
}

export function getStoryCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export const { storiesStorage, strayStorage } = createCacheStorages();
