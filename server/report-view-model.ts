import { appleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { userSummaryRepository } from "../sdk/repositories/user-summary-repository.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import type { CachedReportImages } from "../sdk/lib/image-cache-service.ts";
import { readUserSummaries } from "../sdk/user-summary.ts";
import type { StoryOutputUser, VisionResult } from "../sdk/lib/types.ts";
import { readStoryFeedVision } from "../sdk/story-feed.ts";
import type { AppleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import type { UserSummaryRepository } from "../sdk/repositories/user-summary-repository.ts";
import type { VisionRepository } from "../sdk/repositories/vision-repository.ts";

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
  const userSummaryByUserKey = readUserSummaries(users, {
    visionByPreviewUrl,
    repository: repositories.userSummary,
  });
  const appleCaptionByMediaPk = readAppleCaptions(users, repositories.appleVision);

  return {
    appleCaptionByMediaPk,
    cachedImages,
    userSummaryByUserKey,
    visionByPreviewUrl,
  };
}
