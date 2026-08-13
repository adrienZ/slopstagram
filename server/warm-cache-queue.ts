import process from "node:process";
import { createLogger } from "../sdk/lib/logging-service.ts";
import { processWarmCacheJob, type WarmCacheQueueJob } from "../sdk/warm-cache-worker.ts";
import {
  runWarmCacheJob,
  type WarmCacheJobResult,
  type WarmCachePayload,
} from "../sdk/warm-cache.ts";

const logger = createLogger("warm-cache-queue");

export const WARM_CACHE_QUEUE_NAME = "warm-cache";
export const WARM_CACHE_CRON_PATTERN = "0 * * * *";

interface WarmCacheJob {
  id: string;
  name: string;
  data: WarmCachePayload;
  queueName: string;
}

interface WarmCacheQueue {
  add(name: string, data: WarmCachePayload, options?: { attempts?: number }): Promise<WarmCacheJob>;
  cron(
    id: string,
    pattern: string,
    data?: WarmCachePayload,
    options?: { jobOpts?: { attempts?: number } },
  ): Promise<unknown>;
  close(force?: boolean): Promise<void>;
  on(
    event: "completed",
    listener: (job: WarmCacheJob, result: WarmCacheJobResult) => void,
  ): WarmCacheQueue;
  on(event: "failed", listener: (job: WarmCacheJob, error: Error) => void): WarmCacheQueue;
  on(event: "error", listener: (error: Error) => void): WarmCacheQueue;
}

interface WarmCacheQueueConstructor {
  new (
    name: string,
    options: {
      embedded: true;
      dataPath: string;
      concurrency: number;
      routes: Record<string, (job: WarmCacheJob) => Promise<WarmCacheJobResult>>;
      retry: { maxAttempts: number; strategy: "exponential" };
    },
  ): WarmCacheQueue;
}

interface BunqueueClientModule {
  Bunqueue: WarmCacheQueueConstructor;
  shutdownManager(this: void): void;
}

let warmCacheQueue: WarmCacheQueue | null = null;
let warmCacheQueuePromise: Promise<WarmCacheQueue> | null = null;
let warmCacheCronRegistered = false;

function isBunqueueClientModule(module: unknown): module is BunqueueClientModule {
  return (
    typeof module === "object" &&
    module !== null &&
    "Bunqueue" in module &&
    typeof module.Bunqueue === "function" &&
    "shutdownManager" in module &&
    typeof module.shutdownManager === "function"
  );
}

async function loadBunqueueClientModule(): Promise<BunqueueClientModule> {
  // oxlint-disable-next-line no-inline-comments -- Vite must leave this Bun-only import for runtime.
  const module: unknown = await import("bunqueue/client");

  if (isBunqueueClientModule(module)) return module;
  throw new TypeError("bunqueue/client did not export Bunqueue");
}

function getWarmCacheQueue(): Promise<WarmCacheQueue> {
  if (warmCacheQueue !== null) return Promise.resolve(warmCacheQueue);

  warmCacheQueuePromise ??= loadBunqueueClientModule().then(({ Bunqueue }) => {
    warmCacheQueue = new Bunqueue(WARM_CACHE_QUEUE_NAME, {
      embedded: true,
      dataPath: "./.data/bunqueue.db",
      concurrency: 1,
      routes: {
        [WARM_CACHE_QUEUE_NAME]: (job: WarmCacheJob) => {
          logger.info(`processing job ${job.id}`);
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- job structure from bunqueue includes log/updateProgress at runtime
          return processWarmCacheJob(job as unknown as WarmCacheQueueJob, {
            logger,
            runWarmCacheJob,
          });
        },
      },
      retry: { maxAttempts: 3, strategy: "exponential" },
    });
    return warmCacheQueue;
  });

  return warmCacheQueuePromise;
}

export async function scheduleWarmCacheCron(): Promise<void> {
  if (warmCacheCronRegistered) {
    logger.warn("warm-cache cron already registered, skipping");
    return;
  }

  const queue = await getWarmCacheQueue();
  logger.info(`registering warm-cache cron with pattern: ${WARM_CACHE_CRON_PATTERN}`);
  await queue.cron(
    WARM_CACHE_QUEUE_NAME,
    WARM_CACHE_CRON_PATTERN,
    {},
    {
      jobOpts: { attempts: 3 },
    },
  );
  warmCacheCronRegistered = true;
  logger.info("warm-cache cron registered successfully");
}

export async function closeWarmCacheQueue(): Promise<void> {
  try {
    const queue = warmCacheQueue ?? (await warmCacheQueuePromise);
    await queue?.close(true);
    if (queue !== null) {
      const bunqueueClient = await loadBunqueueClientModule();
      bunqueueClient.shutdownManager();
    }
  } finally {
    warmCacheQueue = null;
    warmCacheQueuePromise = null;
    warmCacheCronRegistered = false;
  }
}

export async function attachWarmCacheQueueLogging(
  captureError?: (error: Error) => void,
): Promise<void> {
  const queue = await getWarmCacheQueue();

  logger.info("attaching warm-cache queue logging handlers");

  queue.on("completed", (job, result) => {
    logger.success(`${job.name} (${job.id}) completed: ${result.outputPath}`);
    process.stdout.write(`${job.name} completed: ${JSON.stringify(result)}\n`);
  });
  queue.on("failed", (job, error) => {
    logger.error(`${job.name} (${job.id}) failed: ${error.message}`);
    process.stderr.write(`${job.name} failed: ${error.message}\n`);
  });
  queue.on("error", (error) => {
    logger.error(`queue error: ${error.message}`);
    captureError?.(error);
  });
}
