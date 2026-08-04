import path from "node:path";
import { backfillReportStoryMediaTypes } from "../create-html-report.ts";
import { BASE_CACHE_DIR, REPORTS_STORAGE_DIR } from "../lib/cache-service.ts";
import { cacheReportImages, type CachedReportImages } from "../lib/image-cache-service.ts";
import { noopLogger } from "../lib/logging-service.ts";
import { resolveOllamaUserSummariesForReport } from "../lib/ollama-user-summary-service.ts";
import type { StoriesManifestReport, VisionResult } from "../lib/types.ts";
import { resolveVisionForReport } from "../lib/vision-service.ts";

export type ReportViewModel = {
  cachedImages: CachedReportImages;
  report: StoriesManifestReport;
  userSummaryByUserKey: Map<string, string>;
  visionByPreviewUrl: Map<string, VisionResult>;
};

export async function createReportViewModel(
  report: StoriesManifestReport,
): Promise<ReportViewModel> {
  const reportDirectory = path.resolve(BASE_CACHE_DIR, REPORTS_STORAGE_DIR);

  await backfillReportStoryMediaTypes(report);
  const cachedImages = await cacheReportImages(report, {
    fetchImage: async () => {
      throw new Error("image missing from cache");
    },
    logger: noopLogger,
    reportDirectory,
  });
  const visionByPreviewUrl = await resolveVisionForReport(report, cachedImages, {
    logger: noopLogger,
    reportDirectory,
  });
  const userSummaryByUserKey = await resolveOllamaUserSummariesForReport(report, {
    logger: noopLogger,
    visionByPreviewUrl,
  });

  return { cachedImages, report, userSummaryByUserKey, visionByPreviewUrl };
}
