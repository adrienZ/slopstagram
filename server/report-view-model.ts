import { createHash } from "node:crypto";
import {
  appleVisionRepository,
  userSummaryRepository,
  visionRepository,
} from "../sdk/lib/entity-repository-service.ts";
import type { CachedReportImages } from "../sdk/lib/image-cache-service.ts";
import { hydrateReportInstagramUsers } from "../sdk/lib/instagram-user-service.ts";
import {
  createSummaryPrompt,
  getUserSummaryPromptHash,
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
  appleCaptionByMediaPk: Map<string, string>;
  cachedImages: CachedReportImages;
  report: StoriesManifestReport;
  userSummaryByUserKey: Map<string, string>;
  visionByPreviewUrl: Map<string, VisionResult>;
};

function getHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getLocalImageUrl(imagePath: string): string | null {
  const marker = "../images/";
  return imagePath.startsWith(marker) ? `/media/${imagePath.slice(marker.length)}` : null;
}

function readCachedImages(report: StoriesManifestReport): CachedReportImages {
  const profilePicPathByUrl = new Map<string, string>();
  const storyPreviewPathByUrl = new Map<string, string>();

  for (const user of report.output.users) {
    const profilePicUrl = user.profile_pic_url?.trim();
    if (
      profilePicUrl !== undefined &&
      profilePicUrl.length > 0 &&
      !profilePicPathByUrl.has(profilePicUrl)
    ) {
      const cachedPath = getLocalImageUrl(profilePicUrl);
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

      const cachedPath = getLocalImageUrl(previewUrl);
      if (cachedPath !== null && cachedPath.length > 0) {
        storyPreviewPathByUrl.set(previewUrl, cachedPath);
      }
    }
  }

  return { profilePicPathByUrl, storyPreviewPathByUrl };
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

      const entry = await visionRepository.findByMediaPk(story.media_pk);
      if (!entry || entry.model !== VISION_MODEL || entry.prompt_hash !== promptHash) {
        continue;
      }

      visionByPreviewUrl.set(previewUrl, entry.result);
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
    const entry = await userSummaryRepository.findBySourceHash(sourceHash);
    const result = entry?.result.trim();

    if (
      entry?.source_hash === sourceHash &&
      entry.prompt_hash === getUserSummaryPromptHash(USER_SUMMARY_PROMPT) &&
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

async function readAppleCaptions(report: StoriesManifestReport): Promise<Map<string, string>> {
  const captionByMediaPk = new Map<string, string>();
  const mediaPks = new Set(
    report.output.users.flatMap((user) => user.stories.map((story) => story.media_pk)),
  );

  for (const mediaPk of mediaPks) {
    const caption = await appleVisionRepository.findByMediaPk(mediaPk);
    if (caption !== null) captionByMediaPk.set(mediaPk, caption);
  }

  return captionByMediaPk;
}

export async function createReportViewModel(
  report: StoriesManifestReport,
): Promise<ReportViewModel> {
  await backfillReportStoryMediaTypes(report);
  await hydrateReportInstagramUsers(report);
  const cachedImages = readCachedImages(report);
  const visionByPreviewUrl = await readCachedVision(report, cachedImages);
  const userSummaryByUserKey = await readCachedUserSummaries(report, visionByPreviewUrl);
  const appleCaptionByMediaPk = await readAppleCaptions(report);

  return {
    appleCaptionByMediaPk,
    cachedImages,
    report,
    userSummaryByUserKey,
    visionByPreviewUrl,
  };
}
