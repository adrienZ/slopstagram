import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";
import { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import { FetchRunRepository } from "@@/core/domains/database/repositories/fetch-run-repository.ts";
import { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import { ReportRepository } from "@@/core/domains/database/repositories/report-repository.ts";
import { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import { UserSummaryRepository } from "@@/core/domains/database/repositories/user-summary-repository.ts";
import { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import { createBunqueue } from "@@/core/domains/fetch-run/bunqueue.ts";
import type { InstagramClient } from "@@/core/domains/instagram/instagram-types.ts";
import {
  BASE_CACHE_DIR,
  createFileCacheStorage,
  type CacheStorage,
} from "@@/core/domains/media-store/cache-storage.ts";
import { createDatabaseBackup } from "@@/core/domains/database/backup.ts";
import { APP_BACKUPS_DIR } from "@@/core/utils/app-data-paths.ts";
import { createLogger, type Logger } from "@@/core/utils/logging.ts";
import type {
  AppleOcrRunner,
  DatabaseBackup,
  FetchImage,
  FetchMedia,
  FetchRunQueue,
  Sleep,
} from "@@/core/domains/runtime/fetch-boundaries.ts";

type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RuntimeBoundaries {
  backup?: DatabaseBackup;
  client?: InstagramClient;
  fetchImage?: FetchImage;
  fetchMedia?: FetchMedia;
  fetchOllama?: HttpFetch;
  logger?: Logger;
  queue?: FetchRunQueue;
  runAppleOcr?: AppleOcrRunner;
  sleep?: Sleep;
  storage?: CacheStorage;
}

export interface Runtime extends RuntimeBoundaries {
  backup: DatabaseBackup;
  appleVision: AppleVisionRepository;
  database: DrizzleDatabase;
  fetchRuns: FetchRunRepository;
  logger: Logger;
  queue: FetchRunQueue;
  reports: ReportRepository;
  stories: StoryRepository;
  summaries: UserSummaryRepository;
  users: InstagramUserRepository;
  storage: CacheStorage;
  vision: VisionRepository;
}

export function createRuntime(
  database: DrizzleDatabase,
  boundaries: RuntimeBoundaries = {},
): Runtime {
  const logger = boundaries.logger ?? createLogger("runtime");
  return {
    ...boundaries,
    appleVision: new AppleVisionRepository(database),
    backup: boundaries.backup ?? createDatabaseBackup(database, APP_BACKUPS_DIR),
    database,
    fetchRuns: new FetchRunRepository(database),
    logger,
    queue: boundaries.queue ?? createBunqueue,
    reports: new ReportRepository(database),
    stories: new StoryRepository(database, logger),
    storage: boundaries.storage ?? createFileCacheStorage(BASE_CACHE_DIR),
    summaries: new UserSummaryRepository(database),
    users: new InstagramUserRepository(database),
    vision: new VisionRepository(database),
  };
}
