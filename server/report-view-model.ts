import { backfillReportStoryMediaTypes } from "../scripts/lib/report-media-type-service.ts";
import {
  cacheReportImages,
  type CachedReportImages,
} from "../scripts/lib/image-cache-service.ts";
import { noopLogger } from "../scripts/lib/logging-service.ts";
import { resolveOllamaUserSummariesForReport } from "../scripts/lib/ollama-user-summary-service.ts";
import type {
  StoriesManifestReport,
  VisionResult,
} from "../scripts/lib/types.ts";
import { resolveVisionForReport } from "../scripts/lib/vision-service.ts";
import { reportDirectory } from "./report-cache.ts";

export type ReportViewModel = {
  cachedImages: CachedReportImages;
  report: StoriesManifestReport;
  userSummaryByUserKey: Map<string, string>;
  visionByPreviewUrl: Map<string, VisionResult>;
};

export async function createReportViewModel(
  report: StoriesManifestReport,
): Promise<ReportViewModel> {
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
