import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";
import { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import { FetchRunRepository } from "@@/core/domains/database/repositories/fetch-run-repository.ts";
import { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import { ReportRepository } from "@@/core/domains/database/repositories/report-repository.ts";
import { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import { UserSummaryRepository } from "@@/core/domains/database/repositories/user-summary-repository.ts";
import { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import type { CacheStorage } from "@@/core/domains/media-store/cache-storage.ts";
import type { Logger } from "@@/core/utils/logging.ts";
import type {
  AppleOcrRunner,
  DatabaseBackup,
  FetchImage,
  FetchMedia,
  FetchRunQueue,
  HttpFetch,
  OpenInstagram,
} from "@@/core/domains/runtime/fetch-boundaries.ts";

export interface RuntimeBoundaries {
  backup: DatabaseBackup;
  fetchImage: FetchImage;
  fetchMedia: FetchMedia;
  fetchOllama: HttpFetch;
  logger: Logger;
  openInstagram: OpenInstagram;
  queue: FetchRunQueue;
  runAppleOcr: AppleOcrRunner;
  storage: CacheStorage;
}

export interface Runtime extends RuntimeBoundaries {
  appleVision: AppleVisionRepository;
  database: DrizzleDatabase;
  fetchRuns: FetchRunRepository;
  reports: ReportRepository;
  stories: StoryRepository;
  summaries: UserSummaryRepository;
  users: InstagramUserRepository;
  vision: VisionRepository;
}

export function createRuntime(database: DrizzleDatabase, boundaries: RuntimeBoundaries): Runtime {
  return {
    ...boundaries,
    appleVision: new AppleVisionRepository(database),
    database,
    fetchRuns: new FetchRunRepository(database),
    reports: new ReportRepository(database),
    stories: new StoryRepository(database, boundaries.logger),
    summaries: new UserSummaryRepository(database),
    users: new InstagramUserRepository(database),
    vision: new VisionRepository(database),
  };
}
