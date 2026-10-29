import { setTimeout as sleep } from "node:timers/promises";
import { createLogger, type Logger } from "./lib/logging-service.ts";
import type { CreateReportBoundaries } from "./report.ts";
import { runWarmCacheJob, type WarmCacheJobResult } from "./warm-cache.ts";

export const WARM_CACHE_QUEUE_NAME = "warm-cache";
const EVERY_HOUR = "0 * * * *";
const SERVER_READY_TIMEOUT_MS = 15_000;
const WARM_CACHE_CRON_PATTERN = EVERY_HOUR;

interface WarmCacheQueue {
  close: () => void;
  waitUntilReady: () => Promise<void>;
  upsertJobScheduler: (
    id: string,
    repeat: { pattern: string },
    job: {
      name: string;
      data: Record<string, never>;
      opts: {
        attempts: number;
        backoff: { type: "exponential"; delay: number };
      };
    },
  ) => Promise<void>;
}

interface WarmCacheWorker {
  close: () => Promise<void>;
  on: (event: "error", listener: (error: Error) => void) => WarmCacheWorker;
  run: () => void;
  waitUntilReady: () => Promise<void>;
}

interface WorkerOptions {
  autorun: false;
  concurrency: number;
}

/**
 * Test seam: tests replace bunqueue, an external server.
 * @public
 */
export interface WarmCacheQueueDependencies {
  createQueue: (name: string) => WarmCacheQueue;
  createWorker: (
    name: string,
    processor: () => Promise<WarmCacheJobResult>,
    options: WorkerOptions,
  ) => WarmCacheWorker;
}

export interface StartWarmCacheQueueOptions {
  /** The external systems each job's report talks to; see {@link CreateReportBoundaries}. */
  boundaries?: CreateReportBoundaries;
  dependencies: WarmCacheQueueDependencies;
  logger?: Logger;
  onError?: (error: Error) => void;
}

export interface WarmCacheQueueRuntime {
  ready: Promise<void>;
  close: () => Promise<void>;
}

async function waitForServer(queue: WarmCacheQueue): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let retryDelay = 50;

  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each readiness attempt must finish before deciding whether to back off.
      await queue.waitUntilReady();
      return;
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error;
      }
      // oxlint-disable-next-line no-await-in-loop -- Backoff is deliberately sequential between readiness attempts.
      await sleep(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 500);
    }
  }
}

export function startWarmCacheQueue({
  boundaries,
  dependencies,
  logger = createLogger(WARM_CACHE_QUEUE_NAME),
  onError,
}: StartWarmCacheQueueOptions): WarmCacheQueueRuntime {
  const queue = dependencies.createQueue(WARM_CACHE_QUEUE_NAME);

  const worker = dependencies.createWorker(
    WARM_CACHE_QUEUE_NAME,
    async () => await runWarmCacheJob({ boundaries, logger }),
    { autorun: false, concurrency: 1 },
  );

  worker.on("error", (error) => onError?.(error));

  const ready = (async () => {
    await waitForServer(queue);
    await queue.upsertJobScheduler(
      WARM_CACHE_QUEUE_NAME,
      { pattern: WARM_CACHE_CRON_PATTERN },
      {
        name: WARM_CACHE_QUEUE_NAME,
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
        },
      },
    );
    worker.run();
    await worker.waitUntilReady();
  })();

  return {
    ready,
    async close() {
      try {
        await worker.close();
      } finally {
        queue.close();
      }
    },
  };
}
