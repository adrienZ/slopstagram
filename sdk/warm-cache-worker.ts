import process from "node:process";
import { createLogger, type Logger } from "./lib/logging-service.ts";
import { runWarmCacheJob, type WarmCacheJobResult, type WarmCachePayload } from "./warm-cache.ts";

export const WARM_CACHE_QUEUE_NAME = "warm-cache";
export const WARM_CACHE_DEFAULT_HOST = "127.0.0.1";
export const WARM_CACHE_DEFAULT_PORT = 6789;

type RunWarmCacheJob = typeof runWarmCacheJob;

export interface WarmCacheQueueJob {
  data: WarmCachePayload;
  id: string;
  log(message: string): Promise<void>;
  updateProgress(progress: number, message?: string): Promise<void>;
}

export interface WarmCacheWorker {
  close(force?: boolean): Promise<void>;
  on(event: "ready", listener: () => void): WarmCacheWorker;
  on(event: "active", listener: (job: WarmCacheQueueJob) => void): WarmCacheWorker;
  on(
    event: "completed",
    listener: (job: WarmCacheQueueJob, result: WarmCacheJobResult) => void,
  ): WarmCacheWorker;
  on(event: "failed", listener: (job: WarmCacheQueueJob, error: Error) => void): WarmCacheWorker;
  on(
    event: "cancelled",
    listener: (data: { jobId: string; reason: string }) => void,
  ): WarmCacheWorker;
  on(event: "stalled", listener: (jobId: string, reason: string) => void): WarmCacheWorker;
  on(event: "error", listener: (error: Error) => void): WarmCacheWorker;
  on(event: "log", listener: (job: WarmCacheQueueJob, message: string) => void): WarmCacheWorker;
}

interface WarmCacheWorkerConstructor {
  new (
    name: string,
    processor: (job: WarmCacheQueueJob) => Promise<WarmCacheJobResult>,
    options: {
      concurrency: number;
      connection: { host: string; port: number };
    },
  ): WarmCacheWorker;
}

interface BunqueueClientModule {
  shutdownManager(this: void): void;
  Worker: WarmCacheWorkerConstructor;
}

export interface ProcessWarmCacheJobOptions {
  logger?: Logger;
  runWarmCacheJob?: RunWarmCacheJob;
}

export interface CreateWarmCacheWorkerOptions {
  host?: string;
  logger?: Logger;
  port?: number;
  runWarmCacheJob?: RunWarmCacheJob;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBunqueueClientModule(module: unknown): module is BunqueueClientModule {
  return (
    typeof module === "object" &&
    module !== null &&
    "Worker" in module &&
    typeof module.Worker === "function" &&
    "shutdownManager" in module &&
    typeof module.shutdownManager === "function"
  );
}

async function loadBunqueueClientModule(): Promise<BunqueueClientModule> {
  const module: unknown = await import("bunqueue/client");
  if (isBunqueueClientModule(module)) return module;
  throw new TypeError("bunqueue/client did not export Worker and shutdownManager");
}

export async function processWarmCacheJob(
  job: WarmCacheQueueJob,
  options: ProcessWarmCacheJobOptions = {},
): Promise<WarmCacheJobResult> {
  const logger = options.logger ?? createLogger("warm-cache-worker");
  const runJob = options.runWarmCacheJob ?? runWarmCacheJob;

  logger.info(`job ${job.id} started`);
  await job.log(`started job ${job.id}`);
  await job.updateProgress(0, "started");

  try {
    const result = await runJob({ payload: job.data });
    const counts = JSON.stringify(result.counts);

    await job.log(`completed job ${job.id}`);
    await job.log(`output ${result.outputPath}`);
    await job.log(`counts ${counts}`);
    await job.updateProgress(100, "completed");
    logger.success(`job ${job.id} completed: ${result.outputPath} counts=${counts}`);

    return result;
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    await job.log(`failed job ${job.id}: ${message}`);
    logger.error(`job ${job.id} failed: ${message}`);
    throw error;
  }
}

export async function createWarmCacheWorker({
  host = WARM_CACHE_DEFAULT_HOST,
  logger = createLogger("warm-cache-worker"),
  port = WARM_CACHE_DEFAULT_PORT,
  runWarmCacheJob: runJob = runWarmCacheJob,
}: CreateWarmCacheWorkerOptions = {}): Promise<WarmCacheWorker> {
  const { Worker } = await loadBunqueueClientModule();
  const worker = new Worker(
    WARM_CACHE_QUEUE_NAME,
    (job) => processWarmCacheJob(job, { logger, runWarmCacheJob: runJob }),
    {
      concurrency: 1,
      connection: { host, port },
    },
  );

  worker.on("ready", () => {
    logger.info(`worker ready on ${host}:${port}`);
  });
  worker.on("active", (job) => {
    logger.info(`job ${job.id} active`);
  });
  worker.on("completed", (job, result) => {
    logger.success(`job ${job.id} completed with ${result.outputFileName}`);
  });
  worker.on("failed", (job, error) => {
    logger.error(`job ${job.id} failed: ${error.message}`);
  });
  worker.on("cancelled", ({ jobId, reason }) => {
    logger.warn(`job ${jobId} cancelled: ${reason}`);
  });
  worker.on("stalled", (jobId, reason) => {
    logger.warn(`job ${jobId} stalled: ${reason}`);
  });
  worker.on("error", (error) => {
    logger.error(`worker error: ${error.message}`);
  });
  worker.on("log", (job, message) => {
    logger.info(`job ${job.id} log: ${message}`);
  });

  return worker;
}

export async function closeWarmCacheWorker(worker: Pick<WarmCacheWorker, "close">): Promise<void> {
  await worker.close();
  const bunqueueClient = await loadBunqueueClientModule();
  bunqueueClient.shutdownManager();
}

export function installWarmCacheWorkerShutdown(
  worker: Pick<WarmCacheWorker, "close">,
  logger: Logger = createLogger("warm-cache-worker"),
): void {
  let closing = false;

  async function close(signal: NodeJS.Signals): Promise<void> {
    if (closing) return;
    closing = true;

    logger.info(`received ${signal}, closing warm-cache worker...`);
    try {
      await closeWarmCacheWorker(worker);
      logger.info("warm-cache worker closed");
    } catch (error: unknown) {
      logger.error(`warm-cache worker close failed: ${getErrorMessage(error)}`);
    }
  }

  process.on("SIGINT", () => void close("SIGINT"));
  process.on("SIGTERM", () => void close("SIGTERM"));
}
