import { resolveAppleCaptionsForReport } from "./apple-caption-report-service.ts";
import { migrateDatabase } from "./database/migrate.ts";
import { ReportRepository } from "./entities/report.ts";
import { BASE_CACHE_DIR } from "./lib/cache-service.ts";
import { reportRepository } from "./lib/entity-repository-service.ts";
import { cacheReportImages } from "./lib/image-cache-service.ts";
import { persistReportInstagramUsers } from "./lib/instagram-user-service.ts";
import { type Logger } from "./lib/logging-service.ts";
import type { StoriesManifestReport } from "./lib/types.ts";
import { resolveUserSummariesForReport } from "./lib/user-summary-resolver-service.ts";
import { resolveVisionForReport } from "./lib/vision-report-service.ts";
import { fetchStories } from "./stories.ts";
import pkg from "../package.json" with { type: "json" };

type CreateReportDependencies = {
  cacheReportImages: typeof cacheReportImages;
  fetchStories: typeof fetchStories;
  migrateDatabase: typeof migrateDatabase;
  persistReportInstagramUsers: typeof persistReportInstagramUsers;
  resolveAppleCaptionsForReport: typeof resolveAppleCaptionsForReport;
  resolveUserSummariesForReport: typeof resolveUserSummariesForReport;
  resolveVisionForReport: typeof resolveVisionForReport;
  saveReport: Pick<ReportRepository, "save">["save"];
};

export type CreateReportOptions = {
  args?: string[];
  dependencies?: Partial<CreateReportDependencies>;
  logger: Logger;
  now?: () => Date;
};

export type CreateReportResult = {
  outputFileName: string;
  reportKey: string;
  report: StoriesManifestReport;
};

const defaultDependencies: CreateReportDependencies = {
  cacheReportImages,
  fetchStories,
  migrateDatabase,
  persistReportInstagramUsers,
  resolveAppleCaptionsForReport,
  resolveUserSummariesForReport: resolveUserSummariesForReport,
  resolveVisionForReport,
  saveReport: reportRepository.save.bind(reportRepository),
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
  const timestamp = formatFilenameTimestamp((options.now ?? (() => new Date()))());
  const outputFileName = `stories-report-${timestamp}.json`;
  const logger = options.logger;

  logger.box(`${pkg.name} - report ${outputFileName}`);
  dependencies.migrateDatabase();
  const report = await dependencies.fetchStories(options.args ?? [], {
    logger,
    reportName: outputFileName,
  });
  const cacheDirectory = BASE_CACHE_DIR;
  const cachedImages = await dependencies.cacheReportImages(report, {
    cacheDirectory,
    logger,
  });
  await dependencies.resolveAppleCaptionsForReport(report, cachedImages, {
    cacheDirectory,
    logger,
  });
  const visionByPreviewUrl = await dependencies.resolveVisionForReport(report, cachedImages, {
    cacheDirectory,
    logger,
  });
  await dependencies.resolveUserSummariesForReport(report, {
    logger,
    visionByPreviewUrl,
  });
  await dependencies.persistReportInstagramUsers(report);
  await dependencies.saveReport(outputFileName, report);
  const counts = report.metadata.counts;

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
}
