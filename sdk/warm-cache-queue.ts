import { setTimeout as sleep } from "node:timers/promises";
import { createLogger, type Logger } from "./lib/logging-service.ts";
import { runWarmCacheJob, type WarmCacheJobResult, type WarmCachePayload } from "./warm-cache.ts";

export const WARM_CACHE_QUEUE_NAME = "warm-cache";
const EVERY_HOUR = "0 * * * *";
const SERVER_READY_TIMEOUT_MS = 15_000;
export const WARM_CACHE_CRON_PATTERN = EVERY_HOUR;

interface WarmCacheQueue {
  close(): void;
  waitUntilReady(): Promise<void>;
  upsertJobScheduler(
    id: string,
    repeat: { pattern: string },
    job: {
      name: string;
      data: WarmCachePayload;
      opts: {
        attempts: number;
        backoff: { type: "exponential"; delay: number };
      };
    },
  ): Promise<void>;
}

interface WarmCacheWorker {
  close(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): this;
  run(): void;
  waitUntilReady(): Promise<void>;
}

interface WarmCacheJob {
  data: WarmCachePayload;
}

interface WorkerOptions {
  autorun: false;
  concurrency: number;
}

export interface WarmCacheQueueDependencies {
  createQueue(name: string): WarmCacheQueue;
  createWorker(
    name: string,
    processor: (job: WarmCacheJob) => Promise<WarmCacheJobResult>,
    options: WorkerOptions,
  ): WarmCacheWorker;
}

export interface StartWarmCacheQueueOptions {
  dependencies: WarmCacheQueueDependencies;
  logger?: Logger;
  onError?: (error: Error) => void;
  runJob?: typeof runWarmCacheJob;
}

export interface WarmCacheQueueRuntime {
  ready: Promise<void>;
  close(): Promise<void>;
}

async function waitForServer(queue: WarmCacheQueue): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let retryDelay = 50;

  for (;;) {
    try {
      await queue.waitUntilReady();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await sleep(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 500);
    }
  }
}

export function startWarmCacheQueue({
  dependencies,
  logger = createLogger(WARM_CACHE_QUEUE_NAME),
  onError,
  runJob = runWarmCacheJob,
}: StartWarmCacheQueueOptions): WarmCacheQueueRuntime {
  const queue = dependencies.createQueue(WARM_CACHE_QUEUE_NAME);

  const worker = dependencies.createWorker(
    WARM_CACHE_QUEUE_NAME,
    (job) => runJob({ payload: job.data, logger }),
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
          backoff: { type: "exponential", delay: 1_000 },
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
