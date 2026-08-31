import path from "node:path";
import { isAppleOcrUnavailable, recognizeAppleCaption } from "./lib/apple-ocr-service.ts";
import type { CachedReportImages } from "./lib/image-cache-service.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoriesManifestReport } from "./lib/types.ts";

type AppleCaptionResolver = (mediaPk: string, imagePath: string) => Promise<string>;

export type ResolveAppleCaptionsOptions = {
  cacheDirectory: string;
  logger: Logger;
  resolver?: AppleCaptionResolver;
};

type LocalStoryPreview = {
  imagePath: string;
  mediaPk: string;
};

function getLocalStoryPreviews(
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  cacheDirectory: string,
): LocalStoryPreview[] {
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
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  options: ResolveAppleCaptionsOptions,
): Promise<void> {
  const previews = getLocalStoryPreviews(report, cachedImages, options.cacheDirectory);
  const resolver = options.resolver ?? recognizeAppleCaption;

  for (const [index, preview] of previews.entries()) {
    try {
      options.logger.progress(index, previews.length, {
        prefix: "apple-captions",
        suffix: preview.mediaPk,
      });
      await resolver(preview.mediaPk, preview.imagePath);
    } catch (error) {
      const ocrError = error instanceof Error ? error : new Error("unknown OCR failure");
      if (isAppleOcrUnavailable(ocrError)) {
        options.logger.warn(
          `apple ocr unavailable; skipping remaining captions: ${ocrError.message}`,
        );
        return;
      }

      const message = ocrError.message;
      options.logger.warn(`apple ocr failed for story ${preview.mediaPk}: ${message}`);
    }

    options.logger.progress(index + 1, previews.length, {
      prefix: "apple-captions",
      suffix: preview.mediaPk,
    });
  }
}
