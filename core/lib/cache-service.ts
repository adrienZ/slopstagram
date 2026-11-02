import { useKV } from "nitro/kv";
import fsDriver from "unstorage/drivers/fs-lite";
import type { StoryItem } from "../instagram-types.ts";
import {
  AUDIO_STORAGE_DIR,
  fileCacheMounts,
  IMAGES_STORAGE_DIR,
  STORIES_STORAGE_DIR,
} from "./cache-mounts.ts";

export type ImageCacheStorage = ReturnType<typeof useKV<Record<string, never>>>;
export type AudioCacheStorage = ReturnType<typeof useKV<Record<string, never>>>;
export type StoryStorage = ReturnType<typeof useKV<StoryItem>>;

/**
 * Backs the image, audio and story caches with files under one cache directory. Nitro's storage is
 * in memory until files are mounted: the server plugin and the scripts mount the application cache,
 * and tests keep the in-memory default or mount a temporary directory.
 */
export function mountFileCache(directory?: string): void {
  const storage = useKV();
  for (const [name, options] of Object.entries(fileCacheMounts(directory))) {
    storage.mount(name, fsDriver(options));
  }
}

export async function unmountFileCache(): Promise<void> {
  const storage = useKV();
  for (const name of Object.keys(fileCacheMounts())) {
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
