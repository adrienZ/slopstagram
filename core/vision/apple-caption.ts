import path from "node:path";
import { isAppleOcrUnavailable, recognizeAppleCaption } from "./apple-ocr.ts";
import type { CachedReportImages } from "@@/core/media-store/image-cache.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";
import type { StoriesManifestReport } from "@@/core/fetch-run/report-types.ts";

export interface ResolveAppleCaptionsOptions {
  cacheDirectory: string;
}

interface LocalStoryPreview {
  imagePath: string;
  mediaPk: string;
}

function getLocalStoryPreviews(
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  cacheDirectory: string,
): Array<LocalStoryPreview> {
  const previews = report.output.users.flatMap((user) =>
    user.stories.flatMap((story) => {
      const cachedPath =
        story.preview_image_url !== null && story.preview_image_url.length > 0
          ? cachedImages.storyPreviewPathByUrl.get(story.preview_image_url)
          : undefined;

      return story.status === "ok" && cachedPath !== undefined && cachedPath.length > 0
        ? [{ imagePath: path.resolve(cacheDirectory, cachedPath), mediaPk: story.media_pk }]
        : [];
    }),
  );

  return [...new Map(previews.map((preview) => [preview.mediaPk, preview])).values()];
}

export async function resolveAppleCaptionsForReport(
  runtime: Pick<Runtime, "appleVision" | "logger" | "runAppleOcr">,
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  options: ResolveAppleCaptionsOptions,
): Promise<void> {
  const previews = getLocalStoryPreviews(report, cachedImages, options.cacheDirectory);

  for (const [index, preview] of previews.entries()) {
    try {
      runtime.logger.progress(index, previews.length, {
        prefix: "apple-captions",
        suffix: preview.mediaPk,
      });
      // oxlint-disable-next-line no-await-in-loop -- Stop subsequent OCR work when the local OCR service is unavailable.
      await recognizeAppleCaption(runtime, preview.mediaPk, preview.imagePath);
    } catch (error) {
      const ocrError = error instanceof Error ? error : new Error("unknown OCR failure");
      if (isAppleOcrUnavailable(ocrError)) {
        runtime.logger.warn(
          `apple ocr unavailable; skipping remaining captions: ${ocrError.message}`,
        );
        return;
      }

      const { message } = ocrError;
      runtime.logger.warn(`apple ocr failed for story ${preview.mediaPk}: ${message}`);
    }

    runtime.logger.progress(index + 1, previews.length, {
      prefix: "apple-captions",
      suffix: preview.mediaPk,
    });
  }
}
