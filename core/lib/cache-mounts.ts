import path from "node:path";
import { APP_CACHE_DIR } from "./app-data-paths.ts";

export const BASE_CACHE_DIR = APP_CACHE_DIR;
export const IMAGES_STORAGE_DIR = "images";
export const AUDIO_STORAGE_DIR = "audio";
export const STORIES_STORAGE_DIR = "stories";

/** The `fs-lite` driver options of each file-backed cache, rooted at one cache directory. */
export function fileCacheMounts(directory: string = BASE_CACHE_DIR) {
  return {
    [IMAGES_STORAGE_DIR]: { base: path.join(directory, IMAGES_STORAGE_DIR), atomic: false },
    [AUDIO_STORAGE_DIR]: { base: path.join(directory, AUDIO_STORAGE_DIR), atomic: true },
    [STORIES_STORAGE_DIR]: { base: path.join(directory, STORIES_STORAGE_DIR), atomic: false },
  };
}
