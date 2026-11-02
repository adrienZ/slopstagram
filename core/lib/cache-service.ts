import path from "node:path";
import { useKV } from "nitro/kv";
import fsDriver from "unstorage/drivers/fs-lite";
import { APP_CACHE_DIR } from "./app-data-paths.ts";
import type { StoryItem } from "../instagram-types.ts";

export type ImageCacheStorage = ReturnType<typeof useKV<Record<string, never>>>;
export type AudioCacheStorage = ReturnType<typeof useKV<Record<string, never>>>;
export type StoryStorage = ReturnType<typeof useKV<StoryItem>>;

export const BASE_CACHE_DIR = APP_CACHE_DIR;
export const IMAGES_STORAGE_DIR = "images";
export const AUDIO_STORAGE_DIR = "audio";
const STORIES_STORAGE_DIR = "stories";

/** The `fs-lite` options of each file-backed cache; audio is written atomically as the media route streams it. */
function fileCacheMounts(directory: string) {
  return {
    [IMAGES_STORAGE_DIR]: { base: path.join(directory, IMAGES_STORAGE_DIR) },
    [AUDIO_STORAGE_DIR]: { base: path.join(directory, AUDIO_STORAGE_DIR), atomic: true },
    [STORIES_STORAGE_DIR]: { base: path.join(directory, STORIES_STORAGE_DIR) },
  };
}

/**
 * Backs the image, audio and story caches with files under one cache directory. Nitro's storage is
 * in memory until files are mounted: the server plugin and the scripts mount the application cache,
 * and tests keep the in-memory default or mount a temporary directory.
 */
export function mountFileCache(directory: string = BASE_CACHE_DIR): void {
  const storage = useKV();
  for (const [name, options] of Object.entries(fileCacheMounts(directory))) {
    storage.mount(name, fsDriver(options));
  }
}

export async function unmountFileCache(): Promise<void> {
  const storage = useKV();
  for (const name of Object.keys(fileCacheMounts(BASE_CACHE_DIR))) {
    // oxlint-disable-next-line no-await-in-loop -- Three unmounts, in order.
    await storage.unmount(name);
  }
}

export function getMediaCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export const imageCacheStorage: ImageCacheStorage = useKV(IMAGES_STORAGE_DIR);
export const audioCacheStorage: AudioCacheStorage = useKV(AUDIO_STORAGE_DIR);
export const storiesStorage: StoryStorage = useKV(STORIES_STORAGE_DIR);
