import { Queue, Worker } from "bunqueue-client";
import type { FetchRunQueue } from "./warm-cache-queue.ts";

export function createBunqueue(): FetchRunQueue {
  return {
    createQueue(name) {
      const queue = new Queue(name);
      return {
        close() {
          queue.close();
        },
        async waitUntilReady() {
          await queue.waitUntilReady();
        },
        async upsertJobScheduler(...args) {
          await queue.upsertJobScheduler(...args);
        },
      };
    },
    createWorker: (name, processor, options) => new Worker(name, processor, options),
  };
}
