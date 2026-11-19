import process from "node:process";
import { createDatabaseBackup } from "@@/core/domains/database/backup.ts";
import { createDrizzle, type DrizzleDatabase } from "@@/core/domains/database/client.ts";
import { createBunqueue } from "@@/core/domains/fetch-run/bunqueue.ts";
import { createInstagramClient } from "@@/core/domains/instagram/story-client.ts";
import {
  BASE_CACHE_DIR,
  createFileCacheStorage,
} from "@@/core/domains/media-store/cache-storage.ts";
import { createAppleOcrRunner } from "@@/core/domains/vision/apple-ocr.ts";
import { APP_BACKUPS_DIR, APP_DATABASE_PATH } from "@@/core/utils/app-data-paths.ts";
import { createLogger } from "@@/core/utils/logging.ts";
import type { InstagramConnection } from "./fetch-boundaries.ts";
import { createRuntime, type Runtime, type RuntimeBoundaries } from "./runtime.ts";

const MEDIA_DOWNLOAD_TIMEOUT_MS = 20_000;

// app/query-service.ts reaches this module, so Playwright stays behind a dynamic import to keep it out of the browser bundle.
async function openInstagram(): Promise<InstagramConnection> {
  const { openInstagramSession, closeInstagramSession } =
    await import("@@/core/domains/instagram/playwright-session.ts");

  const session = await openInstagramSession();

  return {
    client: createInstagramClient(session),
    close: async () => {
      await closeInstagramSession(session);
    },
  };
}

function productionBoundaries(database: DrizzleDatabase): RuntimeBoundaries {
  return {
    backup: createDatabaseBackup(database, APP_BACKUPS_DIR),
    fetchImage: async (url) => await globalThis.fetch(url),
    fetchMedia: async (url) =>
      await globalThis.fetch(url, {
        signal: globalThis.AbortSignal.timeout(MEDIA_DOWNLOAD_TIMEOUT_MS),
      }),
    fetchOllama: async (input, init) => await globalThis.fetch(input, init),
    logger: createLogger("runtime"),
    openInstagram,
    queue: createBunqueue,
    runAppleOcr: createAppleOcrRunner(process.platform),
    storage: createFileCacheStorage(BASE_CACHE_DIR),
  };
}

let productionRuntime: Runtime | undefined;

export function getProductionRuntime(): Runtime {
  if (productionRuntime === undefined) {
    const database = createDrizzle(APP_DATABASE_PATH);
    productionRuntime = createRuntime(database, productionBoundaries(database));
  }

  return productionRuntime;
}
