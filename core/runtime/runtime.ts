import type { DrizzleDatabase } from "@@/core/database/client.ts";
import { AppleVisionRepository } from "@@/core/database/repositories/apple-vision-repository.ts";
import { FetchRunRepository } from "@@/core/database/repositories/fetch-run-repository.ts";
import { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";
import { ReportRepository } from "@@/core/database/repositories/report-repository.ts";
import { StoryRepository } from "@@/core/database/repositories/story-repository.ts";
import { UserSummaryRepository } from "@@/core/database/repositories/user-summary-repository.ts";
import { VisionRepository } from "@@/core/database/repositories/vision-repository.ts";
import type { InstagramClient } from "@@/core/instagram/instagram-types.ts";
import type { CacheReportImagesOptions } from "@@/core/media-store/image-cache.ts";
import type { MusicMediaOptions } from "@@/core/music/music-media.ts";
import type { RecognizeAppleCaptionOptions } from "@@/core/vision/apple-ocr.ts";

type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RuntimeBoundaries {
  client?: InstagramClient;
  fetchImage?: CacheReportImagesOptions["fetchImage"];
  fetchMedia?: MusicMediaOptions["fetchMedia"];
  fetchOllama?: HttpFetch;
  runAppleOcr?: RecognizeAppleCaptionOptions["runAppleOcr"];
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

export function createRuntime(
  database: DrizzleDatabase,
  boundaries: RuntimeBoundaries = {},
): Runtime {
  return {
    ...boundaries,
    appleVision: new AppleVisionRepository(database),
    database,
    fetchRuns: new FetchRunRepository(database),
    reports: new ReportRepository(database),
    stories: new StoryRepository(database),
    summaries: new UserSummaryRepository(database),
    users: new InstagramUserRepository(database),
    vision: new VisionRepository(database),
  };
}
