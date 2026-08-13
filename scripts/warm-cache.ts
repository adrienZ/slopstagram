import process from "node:process";
import { pathToFileURL } from "node:url";
import { createLogger } from "../sdk/lib/logging-service.ts";
import {
  createWarmCacheWorker,
  installWarmCacheWorkerShutdown,
  WARM_CACHE_DEFAULT_HOST,
  WARM_CACHE_DEFAULT_PORT,
} from "../sdk/warm-cache-worker.ts";

// Intentional internal import: bunqueue exposes Worker publicly, but not its server boot API.
import { runServer } from "../node_modules/bunqueue/dist/cli/commands/server.js";

const WARM_CACHE_DATA_PATH = "./.data/bunqueue.db";
const WARM_CACHE_HTTP_PORT = 6790;

async function main(): Promise<void> {
  const logger = createLogger("warm-cache");

  await runServer(
    [
      "--host",
      WARM_CACHE_DEFAULT_HOST,
      "--tcp-port",
      String(WARM_CACHE_DEFAULT_PORT),
      "--http-port",
      String(WARM_CACHE_HTTP_PORT),
      "--data-path",
      WARM_CACHE_DATA_PATH,
    ],
    false,
  );

  const worker = await createWarmCacheWorker({ logger });
  installWarmCacheWorkerShutdown(worker, logger);

  logger.info(
    `push jobs with: bunx bunqueue --host ${WARM_CACHE_DEFAULT_HOST} --port ${WARM_CACHE_DEFAULT_PORT} --json push warm-cache '{}'`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
