import { createStorage, prefixStorage, type Storage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import type {
  AppleCaptionCacheEntry,
  CacheStorageSet,
  ImageCacheEntry,
  OllamaUserSummaryCacheEntry,
  OllamaVisionCacheEntry,
  StoriesManifestReport,
  StoryItem,
} from "./types.ts";

export const BASE_CACHE_DIR = ".tmp";
export const APPLE_CAPTIONS_STORAGE_DIR = "apple-captions";
export const IMAGES_STORAGE_DIR = "images";
export const OLLAMA_USER_SUMMARIES_STORAGE_DIR = "ollama-user-summaries";
export const OLLAMA_VISION_STORAGE_DIR = "ollama-vision";
export const REPORTS_STORAGE_DIR = "reports";
export const STORIES_STORAGE_DIR = "stories";

export const baseStorage = createStorage({
  driver: fsDriver({
    base: BASE_CACHE_DIR,
  }),
});

export function createCacheStorages(
  storage: Storage = baseStorage,
): CacheStorageSet {
  return {
    appleCaptionsStorage: prefixStorage<AppleCaptionCacheEntry>(
      storage,
      APPLE_CAPTIONS_STORAGE_DIR,
    ),
    imageCacheStorage: prefixStorage<ImageCacheEntry>(
      storage,
      IMAGES_STORAGE_DIR,
    ),
    ollamaUserSummaryStorage: prefixStorage<OllamaUserSummaryCacheEntry>(
      storage,
      OLLAMA_USER_SUMMARIES_STORAGE_DIR,
    ),
    ollamaVisionStorage: prefixStorage<OllamaVisionCacheEntry>(
      storage,
      OLLAMA_VISION_STORAGE_DIR,
    ),
    reportsStorage: prefixStorage<StoriesManifestReport>(
      storage,
      REPORTS_STORAGE_DIR,
    ),
    storiesStorage: prefixStorage<StoryItem>(storage, STORIES_STORAGE_DIR),
  };
}

export function getStoryCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export function getAppleCaptionCacheKey(mediaPk: string): string {
  return `${mediaPk}.json`;
}

export function getImageCacheMetadataKey(imageKey: string): string {
  return `${imageKey}.json`;
}

export function getOllamaVisionCacheKey(imageHash: string, model: string): string {
  return `${imageHash}-${model.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}.json`;
}

export function getOllamaUserSummaryCacheKey(sourceHash: string): string {
  return `${sourceHash}.json`;
}

export const {
  appleCaptionsStorage,
  imageCacheStorage,
  ollamaUserSummaryStorage,
  ollamaVisionStorage,
  reportsStorage,
  storiesStorage,
} = createCacheStorages();
