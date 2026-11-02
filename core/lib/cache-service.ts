import { createStorage, prefixStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";
import path from "node:path";
import { APP_CACHE_DIR } from "./app-data-paths.ts";
import type { StoryItem } from "../instagram-types.ts";

export type ImageCacheStorage = Storage<Record<string, never>>;
export type AudioCacheStorage = Storage<Record<string, never>>;
export type StoryStorage = Storage<StoryItem>;

export const BASE_CACHE_DIR = APP_CACHE_DIR;
export const IMAGES_STORAGE_DIR = "images";
export const AUDIO_STORAGE_DIR = "audio";
const STORIES_STORAGE_DIR = "stories";

/** File storage rooted at one cache directory; the app uses BASE_CACHE_DIR, tests a temporary one. */
export function createFileStorage(directory: string): Storage {
  return createStorage({
    // oxlint-disable-next-line typescript/no-unsafe-assignment unstorage drivers use any
    driver: fsDriver({
      base: directory,
    }),
  });
}

const baseStorage = createFileStorage(BASE_CACHE_DIR);

export function createImageCacheStorage(storage: Storage = baseStorage): ImageCacheStorage {
  return prefixStorage<Record<string, never>>(storage, IMAGES_STORAGE_DIR);
}

export function createAudioCacheStorage(
  directory = path.join(BASE_CACHE_DIR, AUDIO_STORAGE_DIR),
): AudioCacheStorage {
  return createStorage({
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- unstorage drivers use any.
    driver: fsDriver({ base: directory, atomic: true }),
  });
}

export function createStoryStorage(storage: Storage = baseStorage): StoryStorage {
  return prefixStorage<StoryItem>(storage, STORIES_STORAGE_DIR);
}

export function getMediaCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export const imageCacheStorage = createImageCacheStorage();
export const audioCacheStorage = createAudioCacheStorage();
export const storiesStorage = createStoryStorage();
