import { createStorage, type Storage, type StorageValue } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";
import path from "node:path";
import type { StoryItem } from "@@/core/instagram/instagram-types.ts";

export type ImageCacheStorage = Storage<Record<string, never>>;
export type AudioCacheStorage = Storage<Record<string, never>>;
type StoryStorage = Storage<StoryItem>;

export interface CacheStorage {
  audio: AudioCacheStorage;
  images: ImageCacheStorage;
  stories: StoryStorage;
}

export { APP_CACHE_DIR as BASE_CACHE_DIR } from "@@/core/utils/app-data-paths.ts";
export const IMAGES_STORAGE_DIR = "images";
export const AUDIO_STORAGE_DIR = "audio";
const STORIES_STORAGE_DIR = "stories";

function createFileStore<T extends StorageValue>(base: string, atomic: boolean): Storage<T> {
  return createStorage<T>({
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- unstorage drivers use any.
    driver: fsDriver({ base, atomic }),
  });
}

export function createFileCacheStorage(directory: string): CacheStorage {
  return {
    audio: createFileStore(path.join(directory, AUDIO_STORAGE_DIR), true),
    images: createFileStore(path.join(directory, IMAGES_STORAGE_DIR), true),
    stories: createFileStore(path.join(directory, STORIES_STORAGE_DIR), false),
  };
}

export function getMediaCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}
