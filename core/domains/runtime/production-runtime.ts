import process from "node:process";
import { createDatabaseBackup } from "@@/core/domains/database/backup.ts";
import { createDrizzle } from "@@/core/domains/database/client.ts";
import { createBunqueue } from "@@/core/domains/fetch-run/bunqueue.ts";
import {
  closeInstagramSession,
  openInstagramSession,
} from "@@/core/domains/instagram/playwright-session.ts";
import { scopeInstagramClientToSession } from "@@/core/domains/instagram/story-client.ts";
import {
  BASE_CACHE_DIR,
  createFileCacheStorage,
} from "@@/core/domains/media-store/cache-storage.ts";
import { createAppleOcrRunner } from "@@/core/domains/vision/apple-ocr.ts";
import { APP_BACKUPS_DIR, APP_DATABASE_PATH } from "@@/core/utils/app-data-paths.ts";
import { createLogger } from "@@/core/utils/logging.ts";
import { createRuntime, type Runtime } from "./runtime.ts";

let productionRuntime: Runtime | undefined;

export function getProductionRuntime(): Runtime {
  if (productionRuntime === undefined) {
    const database = createDrizzle(APP_DATABASE_PATH);

    productionRuntime = createRuntime(database, {
      backup: createDatabaseBackup(database, APP_BACKUPS_DIR),
      fetchImage: globalThis.fetch,
      fetchMedia: globalThis.fetch,
      fetchOllama: globalThis.fetch,
      logger: createLogger("runtime"),
      queue: createBunqueue,
      runAppleOcr: createAppleOcrRunner(process.platform),
      storage: createFileCacheStorage(BASE_CACHE_DIR),
      withInstagramClient: scopeInstagramClientToSession({
        close: closeInstagramSession,
        open: openInstagramSession,
      }),
    });
  }

  return productionRuntime;
}
