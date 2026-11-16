import process from "node:process";
import { createDatabaseBackup } from "@@/core/domains/database/backup.ts";
import { createDrizzle } from "@@/core/domains/database/client.ts";
import { createBunqueue } from "@@/core/domains/fetch-run/bunqueue.ts";
import type { InstagramClient } from "@@/core/domains/instagram/instagram-types.ts";
import {
  closeInstagramSession,
  openInstagramSession,
} from "@@/core/domains/instagram/playwright-session.ts";
import { createInstagramClient } from "@@/core/domains/instagram/story-client.ts";
import {
  BASE_CACHE_DIR,
  createFileCacheStorage,
} from "@@/core/domains/media-store/cache-storage.ts";
import { createAppleOcrRunner } from "@@/core/domains/vision/apple-ocr.ts";
import { APP_BACKUPS_DIR, APP_DATABASE_PATH } from "@@/core/utils/app-data-paths.ts";
import { createLogger } from "@@/core/utils/logging.ts";
import { createRuntime, type Runtime } from "./runtime.ts";

const MEDIA_DOWNLOAD_TIMEOUT_MS = 20_000;

let productionRuntime: Runtime | undefined;

async function fetchHttp(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return await globalThis.fetch(input, init);
}

async function fetchMedia(url: string): Promise<Response> {
  return await globalThis.fetch(url, {
    signal: globalThis.AbortSignal.timeout(MEDIA_DOWNLOAD_TIMEOUT_MS),
  });
}

async function withInstagramSessionClient<T>(
  run: (client: InstagramClient) => Promise<T>,
): Promise<T> {
  const session = await openInstagramSession();

  try {
    return await run(createInstagramClient(session));
  } finally {
    await closeInstagramSession(session);
  }
}

export function getProductionRuntime(): Runtime {
  if (productionRuntime === undefined) {
    const database = createDrizzle(APP_DATABASE_PATH);

    productionRuntime = createRuntime(database, {
      backup: createDatabaseBackup(database, APP_BACKUPS_DIR),
      fetchImage: fetchHttp,
      fetchMedia,
      fetchOllama: fetchHttp,
      logger: createLogger("runtime"),
      queue: createBunqueue,
      runAppleOcr: createAppleOcrRunner(process.platform),
      storage: createFileCacheStorage(BASE_CACHE_DIR),
      withInstagramClient: withInstagramSessionClient,
    });
  }

  return productionRuntime;
}
