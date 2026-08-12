import { resolve } from "node:path";
import { BASE_CACHE_DIR, REPORTS_STORAGE_DIR, reportsStorage } from "./lib/cache-service.ts";
import { cacheReportImages } from "./lib/image-cache-service.ts";
import { type Logger } from "./lib/logging-service.ts";
import { resolveUserSummariesForReport } from "./lib/user-summary-service.ts";
import type { StoriesManifestReport } from "./lib/types.ts";
import { resolveVisionForReport } from "./lib/vision-service.ts";
import { fetchStories } from "./stories.ts";
import pkg from "../package.json" with { type: "json" };

type CreateReportDependencies = {
  cacheReportImages: typeof cacheReportImages;
  fetchStories: typeof fetchStories;
  resolveUserSummariesForReport: typeof resolveUserSummariesForReport;
  resolveVisionForReport: typeof resolveVisionForReport;
  saveReport: (key: string, report: StoriesManifestReport) => Promise<void>;
};

export type CreateReportOptions = {
  args?: string[];
  dependencies?: Partial<CreateReportDependencies>;
  logger: Logger;
  now?: () => Date;
};

export type CreateReportResult = {
  outputFileName: string;
  outputPath: string;
  report: StoriesManifestReport;
};

const defaultDependencies: CreateReportDependencies = {
  cacheReportImages,
  fetchStories,
  resolveUserSummariesForReport: resolveUserSummariesForReport,
  resolveVisionForReport,
  saveReport: async (key, report) => {
    await reportsStorage.setItem(key, report);
  },
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
  const report = await dependencies.fetchStories(options.args ?? [], {
    logger,
    reportName: outputFileName,
  });
  const reportDirectory = resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR);
  const cachedImages = await dependencies.cacheReportImages(report, {
    logger,
    reportDirectory,
  });
  const visionByPreviewUrl = await dependencies.resolveVisionForReport(report, cachedImages, {
    logger,
    reportDirectory,
  });
  await dependencies.resolveUserSummariesForReport(report, {
    logger,
    visionByPreviewUrl,
  });
  await dependencies.saveReport(outputFileName, report);
  const outputPath = resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR, outputFileName);
  const counts = report.metadata.counts;

  logger.info(
    [
      `stories=${counts.stories}`,
      `cache_hits=${counts.cache_hits}`,
      `fetched=${counts.fetched}`,
      `failed=${counts.failed}`,
    ].join(" "),
  );
  logger.success(`wrote report ${outputPath}`);

  return { outputFileName, outputPath, report };
}
