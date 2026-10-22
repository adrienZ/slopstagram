import {
  appleVisionRepository,
  userSummaryRepository,
  visionRepository,
} from "../sdk/lib/entity-repository-service.ts";
import type { CachedReportImages } from "../sdk/lib/image-cache-service.ts";
import {
  createSummaryPrompt,
  getUserSummaryPromptHash,
  getUserSummarySourceHash,
  USER_SUMMARY_MODEL,
  USER_SUMMARY_PROMPT,
  USER_SUMMARY_UNAVAILABLE,
} from "../sdk/lib/user-summary-core-service.ts";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import type { StoryOutputUser, VisionResult } from "../sdk/lib/types.ts";
import { readStoryFeedVision } from "../sdk/story-feed.ts";
import type { AppleVisionRepository } from "../sdk/entities/apple-vision.ts";
import type { UserSummaryRepository } from "../sdk/entities/user-summary.ts";
import type { VisionRepository } from "../sdk/entities/vision.ts";

interface FeedRepositories {
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  userSummary: Pick<UserSummaryRepository, "findBySourceHash">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

export interface ReportViewModel {
  appleCaptionByMediaPk: Map<string, string>;
  cachedImages: CachedReportImages;
  userSummaryByUserKey: Map<string, string>;
  visionByPreviewUrl: Map<string, VisionResult>;
}

function getLocalImageUrl(imagePath: string): string | null {
  const marker = "images/";
  return imagePath.startsWith(marker) ? `/media/${imagePath.slice(marker.length)}` : null;
}

function readCachedImages(users: Array<StoryOutputUser>): CachedReportImages {
  const profilePicPathByUrl = new Map<string, string>();
  const storyPreviewPathByUrl = new Map<string, string>();

  for (const user of users) {
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

function readCachedUserSummaries(
  users: Array<StoryOutputUser>,
  visionByPreviewUrl: Map<string, VisionResult>,
  repository: FeedRepositories["userSummary"],
): Map<string, string> {
  const userSummaryByUserKey = new Map<string, string>();

  const entries = users.map((user) => {
    const userKey = getReportUserKey(user);
    const prompt = createSummaryPrompt(user, visionByPreviewUrl);
    const sourceHash = getUserSummarySourceHash({ model: USER_SUMMARY_MODEL, prompt, userKey });
    return {
      entry: repository.findBySourceHash(sourceHash),
      sourceHash,
      userKey,
    };
  });

  for (const { entry, sourceHash, userKey } of entries) {
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

function readAppleCaptions(
  users: Array<StoryOutputUser>,
  repository: FeedRepositories["appleVision"],
): Map<string, string> {
  const captionByMediaPk = new Map<string, string>();
  const mediaPks = new Set(users.flatMap((user) => user.stories.map((story) => story.media_pk)));

  const captions = [...mediaPks].map((mediaPk) => ({
    caption: repository.findByMediaPk(mediaPk),
    mediaPk,
  }));

  for (const { caption, mediaPk } of captions) {
    if (caption !== null) {
      captionByMediaPk.set(mediaPk, caption);
    }
  }

  return captionByMediaPk;
}

const defaultFeedRepositories: FeedRepositories = {
  appleVision: appleVisionRepository,
  userSummary: userSummaryRepository,
  vision: visionRepository,
};

export function createReportViewModel(
  users: Array<StoryOutputUser>,
  repositories: FeedRepositories = defaultFeedRepositories,
): ReportViewModel {
  const cachedImages = readCachedImages(users);
  const visionByPreviewUrl = readStoryFeedVision(users, repositories.vision);
  const userSummaryByUserKey = readCachedUserSummaries(
    users,
    visionByPreviewUrl,
    repositories.userSummary,
  );
  const appleCaptionByMediaPk = readAppleCaptions(users, repositories.appleVision);

  return {
    appleCaptionByMediaPk,
    cachedImages,
    userSummaryByUserKey,
    visionByPreviewUrl,
  };
}
