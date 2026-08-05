import { createHash } from "node:crypto";
import path from "node:path";
import {
  BASE_CACHE_DIR,
  getImageCacheMetadataKey,
  getMediaCacheKey,
  getOllamaUserSummaryCacheKey,
  IMAGES_STORAGE_DIR,
  imageCacheStorage,
  ollamaUserSummaryStorage,
  visionStorage,
} from "../scripts/lib/cache-service.ts";
import type { CachedReportImages } from "../scripts/lib/image-cache-service.ts";
import {
  createOllamaUserSummaryPrompt,
  getOllamaUserSummarySourceHash,
  OLLAMA_USER_SUMMARY_MODEL,
  OLLAMA_USER_SUMMARY_PROMPT,
  OLLAMA_USER_SUMMARY_UNAVAILABLE,
} from "../scripts/lib/ollama-user-summary-service.ts";
import { backfillReportStoryMediaTypes } from "../scripts/lib/report-media-type-service.ts";
import { getReportUserKey } from "../scripts/lib/report-user-key-service.ts";
import type {
  StoriesManifestReport,
  VisionResult,
} from "../scripts/lib/types.ts";
import {
  VISION_MODEL,
  VISION_PROMPT,
} from "../scripts/lib/vision-service.ts";
import { reportDirectory } from "./report-cache.ts";

export type ReportViewModel = {
  cachedImages: CachedReportImages;
  report: StoriesManifestReport;
  userSummaryByUserKey: Map<string, string>;
  visionByPreviewUrl: Map<string, VisionResult>;
};

function getHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getRawImageKey(imagePath: string): string {
  const prefix = `${IMAGES_STORAGE_DIR}/`;
  return imagePath.startsWith(prefix) ? imagePath.slice(prefix.length) : imagePath;
}

async function getCachedImagePath(metadataKey: string): Promise<string | null> {
  const entry = await imageCacheStorage.getItem(metadataKey);
  if (!entry || !(await imageCacheStorage.hasItem(getRawImageKey(entry.path)))) {
    return null;
  }

  return path
    .relative(reportDirectory, path.resolve(BASE_CACHE_DIR, entry.path))
    .split(path.sep)
    .join("/");
}

async function readCachedImages(
  report: StoriesManifestReport,
): Promise<CachedReportImages> {
  const profilePicPathByUrl = new Map<string, string>();
  const storyPreviewPathByUrl = new Map<string, string>();

  for (const user of report.output.users) {
    const profilePicUrl = user.profile_pic_url?.trim();
    if (profilePicUrl && !profilePicPathByUrl.has(profilePicUrl)) {
      const cachedPath = await getCachedImagePath(
        getImageCacheMetadataKey(`avatars/${getHash(profilePicUrl)}`),
      );
      if (cachedPath) profilePicPathByUrl.set(profilePicUrl, cachedPath);
    }

    for (const story of user.stories) {
      const previewUrl = story.preview_image_url?.trim();
      if (!previewUrl || storyPreviewPathByUrl.has(previewUrl)) continue;

      const cachedPath = await getCachedImagePath(
        getImageCacheMetadataKey(`story-previews/${story.media_pk}`),
      );
      if (cachedPath) storyPreviewPathByUrl.set(previewUrl, cachedPath);
    }
  }

  return { profilePicPathByUrl, storyPreviewPathByUrl };
}

function normalizeCachedVisionResult(value: unknown): VisionResult | null {
  if (typeof value === "string") return { text: "", visual: value.trim() };
  if (
    value &&
    typeof value === "object" &&
    "text" in value &&
    "visual" in value &&
    typeof value.text === "string" &&
    typeof value.visual === "string"
  ) {
    return { text: value.text.trim(), visual: value.visual.trim() };
  }
  return null;
}

async function readCachedVision(
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
): Promise<Map<string, VisionResult>> {
  const visionByPreviewUrl = new Map<string, VisionResult>();
  const promptHash = getHash(VISION_PROMPT);

  for (const user of report.output.users) {
    for (const story of user.stories) {
      const previewUrl = story.preview_image_url?.trim();
      if (!previewUrl || !cachedImages.storyPreviewPathByUrl.has(previewUrl)) {
        continue;
      }

      const entry = await visionStorage.getItem(getMediaCacheKey(story.media_pk));
      if (
        !entry ||
        entry.model !== VISION_MODEL ||
        entry.prompt_hash !== promptHash
      ) {
        continue;
      }

      const result = normalizeCachedVisionResult(entry.result);
      if (result) visionByPreviewUrl.set(previewUrl, result);
    }
  }

  return visionByPreviewUrl;
}

async function readCachedUserSummaries(
  report: StoriesManifestReport,
  visionByPreviewUrl: Map<string, VisionResult>,
): Promise<Map<string, string>> {
  const userSummaryByUserKey = new Map<string, string>();

  for (const user of report.output.users) {
    const userKey = getReportUserKey(user);
    const prompt = createOllamaUserSummaryPrompt(user, visionByPreviewUrl);
    const sourceHash = getOllamaUserSummarySourceHash({
      model: OLLAMA_USER_SUMMARY_MODEL,
      prompt,
      userKey,
    });
    const entry = await ollamaUserSummaryStorage.getItem(
      getOllamaUserSummaryCacheKey(sourceHash),
    );
    const result = entry?.result.trim();

    if (
      entry?.source_hash === sourceHash &&
      entry.prompt === OLLAMA_USER_SUMMARY_PROMPT &&
      entry.user_key === userKey &&
      result &&
      result !== OLLAMA_USER_SUMMARY_UNAVAILABLE
    ) {
      userSummaryByUserKey.set(userKey, result);
    }
  }

  return userSummaryByUserKey;
}

export async function createReportViewModel(
  report: StoriesManifestReport,
): Promise<ReportViewModel> {
  await backfillReportStoryMediaTypes(report);
  const cachedImages = await readCachedImages(report);
  const visionByPreviewUrl = await readCachedVision(report, cachedImages);
  const userSummaryByUserKey = await readCachedUserSummaries(
    report,
    visionByPreviewUrl,
  );

  return { cachedImages, report, userSummaryByUserKey, visionByPreviewUrl };
}
