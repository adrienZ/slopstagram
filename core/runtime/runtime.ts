import type { DrizzleDatabase } from "@@/core/database/client.ts";
import { AppleVisionRepository } from "@@/core/database/repositories/apple-vision-repository.ts";
import { FetchRunRepository } from "@@/core/database/repositories/fetch-run-repository.ts";
import { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";
import { ReportRepository } from "@@/core/database/repositories/report-repository.ts";
import { StoryRepository } from "@@/core/database/repositories/story-repository.ts";
import { UserSummaryRepository } from "@@/core/database/repositories/user-summary-repository.ts";
import { VisionRepository } from "@@/core/database/repositories/vision-repository.ts";
import { createBunqueue } from "@@/core/fetch-run/bunqueue.ts";
import type { FetchRunQueue } from "@@/core/fetch-run/warm-cache-queue.ts";
import type { InstagramClient } from "@@/core/instagram/instagram-types.ts";
import {
  BASE_CACHE_DIR,
  createFileCacheStorage,
  type CacheStorage,
} from "@@/core/media-store/cache-storage.ts";
import type { FetchImage } from "@@/core/media-store/image-cache.ts";
import type { FetchMedia } from "@@/core/music/music-media.ts";
import { createLogger, type Logger } from "@@/core/utils/logging.ts";
import type { AppleOcrRunner } from "@@/core/vision/apple-ocr.ts";

type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RuntimeBoundaries {
  client?: InstagramClient;
  fetchImage?: FetchImage;
  fetchMedia?: FetchMedia;
  fetchOllama?: HttpFetch;
  logger?: Logger;
  queue?: FetchRunQueue;
  runAppleOcr?: AppleOcrRunner;
  storage?: CacheStorage;
}

export interface Runtime extends RuntimeBoundaries {
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
