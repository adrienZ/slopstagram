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

/**
 * The external systems the application talks to besides its database. Each one defaults to
 * the real thing when left out, so production passes none of them and a test passes only
 * the one it replaces.
 */
export interface RuntimeBoundaries {
  /** The Instagram client. Without it, a fetch opens a browser session. */
  client?: InstagramClient;
  /** Downloads story previews and profile pictures. */
  fetchImage?: CacheReportImagesOptions["fetchImage"];
  /** Downloads music audio and artwork. */
  fetchMedia?: MusicMediaOptions["fetchMedia"];
  /** HTTP calls to Ollama, for vision analysis and user summaries. */
  fetchOllama?: HttpFetch;
  /** Runs Apple OCR on an image. */
  runAppleOcr?: RecognizeAppleCaptionOptions["runAppleOcr"];
}

/** The repositories and external boundaries every step of the application depends on. */
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

/** Builds each repository once over `database`. This is the only place that constructs them. */
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
