import { createStorage, type Storage, type StorageValue } from "unstorage";
import type { StoryItem } from "@@/core/instagram/instagram-types.ts";
import type { CacheStorage } from "@@/core/media-store/cache-storage.ts";

export function createMemoryStorage<T extends StorageValue>(): Storage<T> {
  // memoryDriver by default
  return createStorage<T>();
}

export function createMemoryCacheStorage(): CacheStorage {
  return {
    audio: createMemoryStorage<Record<string, never>>(),
    images: createMemoryStorage<Record<string, never>>(),
    stories: createMemoryStorage<StoryItem>(),
  };
}
