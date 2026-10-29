import { resolveAppleCaptionsForReport } from "./apple-caption-report-service.ts";
import { type DrizzleDatabase, useDrizzle } from "./database/client.ts";
import { recordFetchRun } from "./fetch-run.ts";
import type { InstagramClient } from "./instagram-types.ts";
import { ReportRepository } from "./repositories/report-repository.ts";
import {
  BASE_CACHE_DIR,
  createFileStorage,
  createImageCacheStorage,
  createStoryStorage,
} from "./lib/cache-service.ts";
import { AppleVisionRepository } from "./repositories/apple-vision-repository.ts";
import { FetchRunRepository } from "./repositories/fetch-run-repository.ts";
import { InstagramUserRepository } from "./repositories/instagram-user-repository.ts";
import { StoryRepository } from "./repositories/story-repository.ts";
import { UserSummaryRepository } from "./repositories/user-summary-repository.ts";
import { VisionRepository } from "./repositories/vision-repository.ts";
import { createStoryFeed, readStoryFeedVision } from "./story-feed.ts";
import { cacheReportImages, type CacheReportImagesOptions } from "./lib/image-cache-service.ts";
import {
  type RecognizeAppleCaptionOptions,
  recognizeAppleCaption,
} from "./lib/apple-ocr-service.ts";
import { cacheReportAudio } from "./report-audio-service.ts";
import type { MusicMediaOptions } from "./music-media-service.ts";
import { persistReportInstagramUsers } from "./lib/instagram-user-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoriesManifestReport } from "./report-types.ts";
import { resolveUserSummariesForReport } from "./user-summary.ts";
import { resolveVisionForReport } from "./lib/vision-report-service.ts";
import { fetchStories } from "./stories.ts";
import pkg from "../package.json" with { type: "json" };

type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * The external systems report creation talks to. Each one defaults to the real thing, so
 * production passes none of them; tests replace only these and run every pipeline step.
 */
export interface CreateReportBoundaries {
  /** Where story, image and audio files are cached. Defaults to the application cache. */
  cacheDirectory?: string;
  /** The Instagram client. Without it, a browser session is opened. */
  client?: InstagramClient;
  /** The database every step reads and writes. Defaults to the application database. */
  database?: DrizzleDatabase;
  /** Downloads story previews and profile pictures. */
  fetchImage?: CacheReportImagesOptions["fetchImage"];
  /** Downloads music audio and artwork. */
  fetchMedia?: MusicMediaOptions["fetchMedia"];
  /** HTTP calls to Ollama, for vision analysis and user summaries. */
  fetchOllama?: HttpFetch;
  /** Runs Apple OCR on an image. */
  runAppleOcr?: RecognizeAppleCaptionOptions["runAppleOcr"];
}

export interface CreateReportOptions {
  args?: Array<string>;
  boundaries?: CreateReportBoundaries;
  logger: Logger;
  now?: () => Date;
}

export interface CreateReportResult {
  outputFileName: string;
  reportKey: string;
  report: StoriesManifestReport;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${sign}${pad(hours)}${pad(minutes)}`;
}

function formatFilenameTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}${formatTimezoneOffset(date)}`;
}

export async function createReport(options: CreateReportOptions): Promise<CreateReportResult> {
  const boundaries = options.boundaries ?? {};
  const database = boundaries.database ?? useDrizzle();
  const stories = new StoryRepository(database, options.logger);
  const reports = new ReportRepository(database);
  const users = new InstagramUserRepository(database);
  const vision = new VisionRepository(database);
  const appleVision = new AppleVisionRepository(database);
  const summaries = new UserSummaryRepository(database);
  const cacheDirectory = boundaries.cacheDirectory ?? BASE_CACHE_DIR;
  const files =
    boundaries.cacheDirectory === undefined ? undefined : createFileStorage(cacheDirectory);
  const now = options.now ?? (() => new Date());
  return await recordFetchRun(
    async (run) => {
      const timestamp = formatFilenameTimestamp(run.startedAt);
      const outputFileName = `stories-report-${timestamp}-${run.id}.json`;
      const { logger } = options;
      logger.box(`${pkg.name} - report ${outputFileName}`);
      const report = await fetchStories(options.args ?? [], {
        client: boundaries.client,
        logger,
        now,
        reportName: outputFileName,
        storyRepository: stories,
        storyStorage: files === undefined ? undefined : createStoryStorage(files),
      });
      run.report = report;
      // Keep the observation and failures even if enrichment or every media fetch fails.
      await reports.save(outputFileName, report);
      run.reportKey = outputFileName;
      const { counts } = report.metadata;
      if (counts.stories > 0 && counts.fetched === 0) {
        throw new Error(
          `No story media could be fetched (${counts.failed}/${counts.stories} failed). ${report.failures[0]?.message ?? "Instagram returned no story media"}`,
        );
      }
      await cacheReportAudio(report, {
        database,
        directory: boundaries.cacheDirectory,
        fetchMedia: boundaries.fetchMedia,
      });
      const cachedImages = await cacheReportImages(report, {
        cacheDirectory,
        fetchImage: boundaries.fetchImage,
        logger,
        storage: files === undefined ? undefined : createImageCacheStorage(files),
      });
      await resolveAppleCaptionsForReport(report, cachedImages, {
        cacheDirectory,
        logger,
        resolver: async (mediaPk, imagePath) =>
          await recognizeAppleCaption(mediaPk, imagePath, {
            repository: appleVision,
            runAppleOcr: boundaries.runAppleOcr,
          }),
      });
      await resolveVisionForReport(report, cachedImages, {
        cacheDirectory,
        fetchVision: boundaries.fetchOllama,
        logger,
        repository: vision,
      });
      await persistReportInstagramUsers(report, users);
      // Generate from the same canonical, active story set used by the user app.
      const feedUsers = createStoryFeed(now(), { repository: stories });
      await resolveUserSummariesForReport(
        { output: { users: feedUsers } },
        {
          fetchOllama: boundaries.fetchOllama,
          logger,
          repository: summaries,
          visionByPreviewUrl: readStoryFeedVision(feedUsers, vision),
        },
      );
      await reports.save(outputFileName, report);
      logger.info(
        [`stories=${counts.stories}`, `fetched=${counts.fetched}`, `failed=${counts.failed}`].join(
          " ",
        ),
      );
      logger.success(`saved report ${outputFileName} to the database`);

      return { outputFileName, reportKey: outputFileName, report };
    },
    { repository: new FetchRunRepository(database), now },
  );
}
