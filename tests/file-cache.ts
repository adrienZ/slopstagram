import { mountFileCache, unmountFileCache } from "@@/core/lib/cache-service.ts";

/** Backs the image, audio and story caches with a temporary directory for the current test. */
export async function useFileCache(directory: string): Promise<void> {
  await unmountFileCache();
  mountFileCache(directory);
}
