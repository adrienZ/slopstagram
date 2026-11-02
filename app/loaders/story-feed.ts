import "@tanstack/react-start/server-only";
import {
  appleVisionRepository,
  type AppleVisionRepository,
} from "@@/core/database/repositories/apple-vision-repository.ts";
import {
  userSummaryRepository,
  type UserSummaryRepository,
} from "@@/core/database/repositories/user-summary-repository.ts";
import {
  visionRepository,
  type VisionRepository,
} from "@@/core/database/repositories/vision-repository.ts";
import { storyRepository } from "@@/core/database/repositories/story-repository.ts";
import type { CachedReportImages } from "@@/core/media-store/image-cache.ts";
import { getReportUserKey } from "@@/core/accounts/report-user-key-service.ts";
import { readUserSummaries } from "@@/core/accounts/user-summary.ts";
import type { StoryOutputUser } from "@@/core/report-types.ts";
import type { VisionResult } from "@@/core/database/entities/vision.ts";
import { createReportFeed, readStoryFeedVision } from "@@/core/story-feed.ts";
import { createStoryCards, withStoryStickers } from "../utils/story-cards.ts";
import { formatReportDate } from "../utils/helper.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

interface FeedRepositories {
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  userSummary: Pick<UserSummaryRepository, "findBySourceHash">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

export interface StoryFeedSources {
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

export function readStoryFeedSources(
  users: Array<StoryOutputUser>,
  repositories: FeedRepositories = defaultFeedRepositories,
): StoryFeedSources {
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

export function loadStoryFeed(
  now: Date = new Date(),
  selectedDate?: string,
  selectedStory?: string,
) {
  const {
    today,
    selectedDate: day,
    availableDates,
    users: feedUsers,
  } = createReportFeed(now, selectedDate, { selectedStory });
  const sources = readStoryFeedSources(feedUsers);
  const sidebarUsers = loadSidebarUsers();
  const storedStories = feedUsers.flatMap((user) =>
    user.stories.flatMap(({ media_pk }) => {
      const story = storyRepository.findByMediaPk(media_pk);
      return story === null ? [] : [{ story }];
    }),
  );
  const users = feedUsers.map((user) => ({
    user,
    avatar: sources.cachedImages.profilePicPathByUrl.get(user.profile_pic_url?.trim() ?? ""),
    summary: sources.userSummaryByUserKey.get(getReportUserKey(user)),
    stories: withStoryStickers(createStoryCards(user, sources), storedStories, sidebarUsers),
  }));
  return {
    date: formatReportDate(now.toISOString()),
    selectedDate: day,
    today,
    availableDates,
    sidebarUsers,
    users,
  };
}

export type StoryFeedPageData = ReturnType<typeof loadStoryFeed>;
