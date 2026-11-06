import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { runWarmCacheJob } from "@@/core/domains/fetch-run/warm-cache.ts";

export const WARM_CACHE_QUEUE_NAME = "warm-cache";
export const WARM_CACHE_CRON_PATTERN = "0 * * * *";

export interface StartWarmCacheQueueOptions {
  onError?: (error: Error) => void;
}

export interface StartedWarmCacheQueue {
  ready: Promise<void>;
  close: () => Promise<void>;
}

export function startWarmCacheQueue(
  runtime: Pick<Runtime, "queue"> & Parameters<typeof runWarmCacheJob>[0],
  { onError }: StartWarmCacheQueueOptions = {},
): StartedWarmCacheQueue {
  const queue = runtime.queue(WARM_CACHE_QUEUE_NAME, async () => await runWarmCacheJob(runtime));

  queue.on("error", (error) => {
    onError?.(error);
  });

  async function schedule() {
    await queue.cron(WARM_CACHE_QUEUE_NAME, WARM_CACHE_CRON_PATTERN);
  }

  async function close() {
    await queue.close();
  }

  return { ready: schedule(), close };
}
