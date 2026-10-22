import { resolveAppleCaptionsForReport } from "./apple-caption-report-service.ts";
import { recordFetchRun } from "./fetch-run.ts";
import type { ReportRepository } from "./repositories/report-repository.ts";
import { BASE_CACHE_DIR } from "./lib/cache-service.ts";
import { fetchRunRepository } from "./repositories/fetch-run-repository.ts";
import { reportRepository } from "./repositories/report-repository.ts";
import type { FetchRunRepository } from "./repositories/fetch-run-repository.ts";
import { createStoryFeed, readStoryFeedVision } from "./story-feed.ts";
import { cacheReportImages } from "./lib/image-cache-service.ts";
import { persistReportInstagramUsers } from "./lib/instagram-user-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoriesManifestReport } from "./lib/types.ts";
import { resolveUserSummariesForReport } from "./lib/user-summary-resolver-service.ts";
import { resolveVisionForReport } from "./lib/vision-report-service.ts";
import { fetchStories } from "./stories.ts";

interface CreateReportDependencies {
  cacheReportImages: typeof cacheReportImages;
  fetchStories: typeof fetchStories;
  persistReportInstagramUsers: typeof persistReportInstagramUsers;
  resolveAppleCaptionsForReport: typeof resolveAppleCaptionsForReport;
  resolveUserSummariesForReport: typeof resolveUserSummariesForReport;
  resolveVisionForReport: typeof resolveVisionForReport;
  saveReport: Pick<ReportRepository, "save">["save"];
  fetchRunRepository: Pick<FetchRunRepository, "start" | "finish">;
  createStoryFeed: typeof createStoryFeed;
  readStoryFeedVision: typeof readStoryFeedVision;
}

export interface CreateReportOptions {
  args?: Array<string>;
  dependencies?: Partial<CreateReportDependencies>;
  logger: Logger;
  now?: () => Date;
}

export interface CreateReportResult {
  outputFileName: string;
  reportKey: string;
  report: StoriesManifestReport;
}

const defaultDependencies: CreateReportDependencies = {
  cacheReportImages,
  fetchStories,
  persistReportInstagramUsers,
  resolveAppleCaptionsForReport,
  resolveUserSummariesForReport,
  resolveVisionForReport,
  saveReport: reportRepository.save.bind(reportRepository),
  fetchRunRepository,
  createStoryFeed,
  readStoryFeedVision,
};

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
  const dependencies = {
    ...defaultDependencies,
    ...options.dependencies,
  };
  const now = options.now ?? (() => new Date());
  return await recordFetchRun(
    async (run) => {
      const timestamp = formatFilenameTimestamp(run.startedAt);
      const outputFileName = `stories-report-${timestamp}-${run.id}.json`;
      const { logger } = options;
      logger.box(`slopstragram - report ${outputFileName}`);
      const report = await dependencies.fetchStories(options.args ?? [], {
        logger,
        reportName: outputFileName,
      });
      run.report = report;
      // Keep the observation and failures even if enrichment or every media fetch fails.
      await dependencies.saveReport(outputFileName, report);
      run.reportKey = outputFileName;
      const { counts } = report.metadata;
      if (counts.stories > 0 && counts.fetched + counts.cache_hits === 0) {
        throw new Error(
          `No story media could be fetched (${counts.failed}/${counts.stories} failed). ${report.failures[0]?.message ?? "Instagram returned no story media"}`,
        );
      }
      const cacheDirectory = BASE_CACHE_DIR;
      const cachedImages = await dependencies.cacheReportImages(report, {
        cacheDirectory,
        logger,
      });
      await dependencies.resolveAppleCaptionsForReport(report, cachedImages, {
        cacheDirectory,
        logger,
      });
      await dependencies.resolveVisionForReport(report, cachedImages, {
        cacheDirectory,
        logger,
      });
      await dependencies.persistReportInstagramUsers(report);
      // Generate from the same canonical, active story set used by the user app.
      const feedUsers = dependencies.createStoryFeed(now());
      await dependencies.resolveUserSummariesForReport(
        { output: { users: feedUsers } },
        {
          logger,
          visionByPreviewUrl: dependencies.readStoryFeedVision(feedUsers),
        },
      );
      await dependencies.saveReport(outputFileName, report);
      logger.info(
        [
          `stories=${counts.stories}`,
          `cache_hits=${counts.cache_hits}`,
          `fetched=${counts.fetched}`,
          `failed=${counts.failed}`,
        ].join(" "),
      );
      logger.success(`saved report ${outputFileName} to the database`);

      return { outputFileName, reportKey: outputFileName, report };
    },
    { repository: dependencies.fetchRunRepository, now },
  );
}
