import { Bunqueue } from "bunqueue-client";
import type { FetchRunQueue } from "./warm-cache-queue.ts";

export function createBunqueue(...[name, processor]: Parameters<FetchRunQueue>) {
  return new Bunqueue(name, {
    embedded: false,
    processor,
    retry: { maxAttempts: 3, delay: 1000, strategy: "exponential" },
  });
}
