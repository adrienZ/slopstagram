import { createLogger, type Logger } from "./lib/logging-service.ts";
import { runWarmCacheJob, type WarmCacheJobResult, type WarmCachePayload } from "./warm-cache.ts";

export const WARM_CACHE_QUEUE_NAME = "warm-cache";
const EVERY_HOUR = "0 * * * *";
export const WARM_CACHE_CRON_PATTERN = EVERY_HOUR;
export const WARM_CACHE_DATA_PATH = "./.data/bunqueue.db";

interface WarmCacheQueue {
  close(): void;
  upsertJobScheduler(
    id: string,
    repeat: { pattern: string },
    job: { name: string; data: WarmCachePayload },
  ): Promise<unknown>;
}

interface WarmCacheWorker {
  close(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): this;
}

interface WarmCacheJob {
  data: WarmCachePayload;
}

interface QueueOptions {
  embedded: true;
  dataPath: string;
  defaultJobOptions: {
    attempts: number;
    backoff: { type: "exponential"; delay: number };
  };
}

interface WorkerOptions {
  embedded: true;
  dataPath: string;
  concurrency: number;
}

export interface WarmCacheQueueDependencies {
  createQueue(name: string, options: QueueOptions): WarmCacheQueue;
  createWorker(
    name: string,
    processor: (job: WarmCacheJob) => Promise<WarmCacheJobResult>,
    options: WorkerOptions,
  ): WarmCacheWorker;
  shutdown(): void;
}

export interface StartWarmCacheQueueOptions {
  dependencies: WarmCacheQueueDependencies;
  logger?: Logger;
  onError?: (error: Error) => void;
  runJob?: typeof runWarmCacheJob;
}

export interface WarmCacheQueueRuntime {
  ready: Promise<unknown>;
  close(): Promise<void>;
}

export function startWarmCacheQueue({
  dependencies,
  logger = createLogger(WARM_CACHE_QUEUE_NAME),
  onError,
  runJob = runWarmCacheJob,
}: StartWarmCacheQueueOptions): WarmCacheQueueRuntime {
  const queue = dependencies.createQueue(WARM_CACHE_QUEUE_NAME, {
    embedded: true,
    dataPath: WARM_CACHE_DATA_PATH,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
    },
  });

  const ready = queue.upsertJobScheduler(
    WARM_CACHE_QUEUE_NAME,
    { pattern: WARM_CACHE_CRON_PATTERN },
    { name: WARM_CACHE_QUEUE_NAME, data: {} },
  );

  const worker = dependencies.createWorker(
    WARM_CACHE_QUEUE_NAME,
    (job) => runJob({ payload: job.data, logger }),
    { embedded: true, dataPath: WARM_CACHE_DATA_PATH, concurrency: 1 },
  );

  worker.on("error", (error) => onError?.(error));

  return {
    ready,
    async close() {
      try {
        await worker.close();
      } finally {
        queue.close();
        dependencies.shutdown();
      }
    },
  };
}
