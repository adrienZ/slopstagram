import { createStorage, type Storage, type StorageValue } from "unstorage";

export function createMemoryStorage<T extends StorageValue>(): Storage<T> {
  // memoryDriver by default
  return createStorage<T>();
}
