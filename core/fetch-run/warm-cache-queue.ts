import type { Runtime } from "@@/core/runtime/runtime.ts";
import { createLogger, type Logger } from "@@/core/utils/logging.ts";
import type { CreateReportBoundaries } from "./report.ts";
import { runWarmCacheJob, type WarmCacheJobResult } from "./warm-cache.ts";

export const WARM_CACHE_QUEUE_NAME = "warm-cache";
export const WARM_CACHE_CRON_PATTERN = "0 * * * *";

interface ScheduledQueue {
  on: (event: "error", listener: (error: Error) => void) => void;
  cron: (id: string, pattern: string) => Promise<object | null>;
  close: () => Promise<void>;
}

export type FetchRunQueue = (
  name: string,
  processor: () => Promise<WarmCacheJobResult>,
) => ScheduledQueue;

export interface StartWarmCacheQueueOptions {
  boundaries?: CreateReportBoundaries;
  logger?: Logger;
  onError?: (error: Error) => void;
}

export interface StartedWarmCacheQueue {
  ready: Promise<void>;
  close: () => Promise<void>;
}

export function startWarmCacheQueue(
  runtime: Pick<Runtime, "queue">,
  {
    boundaries,
    logger = createLogger(WARM_CACHE_QUEUE_NAME),
    onError,
  }: StartWarmCacheQueueOptions = {},
): StartedWarmCacheQueue {
  const queue = runtime.queue(
    WARM_CACHE_QUEUE_NAME,
    async () => await runWarmCacheJob({ boundaries, logger }),
  );

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
