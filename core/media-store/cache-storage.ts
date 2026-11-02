import { createStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";
import path from "node:path";
import type { StoryItem } from "@@/core/instagram/instagram-types.ts";

export type ImageCacheStorage = Storage<Record<string, never>>;
export type AudioCacheStorage = Storage<Record<string, never>>;
export type StoryStorage = Storage<StoryItem>;

export interface CacheStorage {
  audio: AudioCacheStorage;
  images: ImageCacheStorage;
  stories: StoryStorage;
}

export { APP_CACHE_DIR as BASE_CACHE_DIR } from "@@/core/utils/app-data-paths.ts";
export const IMAGES_STORAGE_DIR = "images";
export const AUDIO_STORAGE_DIR = "audio";
const STORIES_STORAGE_DIR = "stories";

export function createFileCacheStorage(directory: string): CacheStorage {
  return {
    audio: createStorage({
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- unstorage drivers use any.
      driver: fsDriver({ base: path.join(directory, AUDIO_STORAGE_DIR), atomic: true }),
    }),
    images: createStorage({
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- unstorage drivers use any.
      driver: fsDriver({ base: path.join(directory, IMAGES_STORAGE_DIR), atomic: true }),
    }),
    stories: createStorage<StoryItem>({
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- unstorage drivers use any.
      driver: fsDriver({ base: path.join(directory, STORIES_STORAGE_DIR) }),
    }),
  };
}

export function getMediaCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}
