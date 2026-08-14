import { createHash } from "node:crypto";
import {
  getMediaCacheKey,
  getUserSummaryCacheKey,
  imageCacheStorage,
  userSummaryStorage,
  visionStorage,
} from "../sdk/lib/cache-service.ts";
import type { CachedReportImages } from "../sdk/lib/image-cache-service.ts";
import {
  createSummaryPrompt,
  getUserSummarySourceHash,
  USER_SUMMARY_MODEL,
  USER_SUMMARY_PROMPT,
  USER_SUMMARY_UNAVAILABLE,
} from "../sdk/lib/user-summary-core-service.ts";
import { backfillReportStoryMediaTypes } from "../sdk/lib/report-media-type-service.ts";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import type { StoriesManifestReport, VisionResult } from "../sdk/lib/types.ts";
import { VISION_MODEL, VISION_PROMPT } from "../sdk/lib/vision-analysis-service.ts";

export type ReportViewModel = {
  cachedImages: CachedReportImages;
  report: StoriesManifestReport;
  userSummaryByUserKey: Map<string, string>;
  visionByPreviewUrl: Map<string, VisionResult>;
};

function getHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getImageRawKey(namespace: string, imageKey: string): string {
  return `${namespace}/${imageKey}.jpg`;
}

async function getCachedImagePath(rawKey: string): Promise<string | null> {
  if (!(await imageCacheStorage.hasItem(rawKey))) {
    return null;
  }

  return `/media/${rawKey}`;
}

async function readCachedImages(report: StoriesManifestReport): Promise<CachedReportImages> {
  const profilePicPathByUrl = new Map<string, string>();
  const storyPreviewPathByUrl = new Map<string, string>();

  for (const user of report.output.users) {
    const profilePicUrl = user.profile_pic_url?.trim();
    if (
      profilePicUrl !== undefined &&
      profilePicUrl.length > 0 &&
      !profilePicPathByUrl.has(profilePicUrl)
    ) {
      const cachedPath = await getCachedImagePath(
        getImageRawKey("avatars", getHash(profilePicUrl)),
      );
      if (cachedPath !== null && cachedPath.length > 0) {
        profilePicPathByUrl.set(profilePicUrl, cachedPath);
      }
    }

    for (const story of user.stories) {
      const previewUrl = story.preview_image_url?.trim();
      if (
        previewUrl === undefined ||
        previewUrl.length === 0 ||
        storyPreviewPathByUrl.has(previewUrl)
      ) {
        continue;
      }

      const cachedPath = await getCachedImagePath(getImageRawKey("story-previews", story.media_pk));
      if (cachedPath !== null && cachedPath.length > 0) {
        storyPreviewPathByUrl.set(previewUrl, cachedPath);
      }
    }
  }

  return { profilePicPathByUrl, storyPreviewPathByUrl };
}

function normalizeCachedVisionResult(value: unknown): VisionResult | null {
  if (typeof value === "string") return { text: "", visual: value.trim() };
  if (
    value !== null &&
    value !== undefined &&
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
      if (
        previewUrl === undefined ||
        previewUrl.length === 0 ||
        !cachedImages.storyPreviewPathByUrl.has(previewUrl)
      ) {
        continue;
      }

      const entry = await visionStorage.getItem(getMediaCacheKey(story.media_pk));
      if (!entry || entry.model !== VISION_MODEL || entry.prompt_hash !== promptHash) {
        continue;
      }

      const result = normalizeCachedVisionResult(entry.result);
      if (result !== null) {
        visionByPreviewUrl.set(previewUrl, result);
      }
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
    const prompt = createSummaryPrompt(user, visionByPreviewUrl);
    const sourceHash = getUserSummarySourceHash({
      model: USER_SUMMARY_MODEL,
      prompt,
      userKey,
    });
    const entry = await userSummaryStorage.getItem(getUserSummaryCacheKey(sourceHash));
    const result = entry?.result.trim();

    if (
      entry?.source_hash === sourceHash &&
      entry.prompt === USER_SUMMARY_PROMPT &&
      entry.user_key === userKey &&
      result !== undefined &&
      result.length > 0 &&
      result !== USER_SUMMARY_UNAVAILABLE
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
  const userSummaryByUserKey = await readCachedUserSummaries(report, visionByPreviewUrl);

  return { cachedImages, report, userSummaryByUserKey, visionByPreviewUrl };
}
