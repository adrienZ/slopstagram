import { randomUUID } from "node:crypto";
import { useKV } from "nitro/kv";

/** A storage of its own on Nitro's in-memory default, isolated from every other test's. */
export function createMemoryStorage<T extends object = Record<string, never>>() {
  return useKV<T>(`memory-${randomUUID()}`);
}
