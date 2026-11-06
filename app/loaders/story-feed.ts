import "@tanstack/react-start/server-only";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { UserSummaryRepository } from "@@/core/domains/database/repositories/user-summary-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import type { CachedReportImages } from "@@/core/domains/media-store/image-cache.ts";
import { getReportUserKey } from "@@/core/domains/accounts/report-user-key.ts";
import type { StoryOutputUser } from "@@/core/domains/fetch-run/report-types.ts";
import type { VisionResult } from "@@/core/domains/database/entities/vision.ts";
import { readFeedUserSummaries } from "@@/core/domains/story-feed/feed-user-summary.ts";
import { createReportFeed, readStoryFeedVision } from "@@/core/domains/story-feed/story-feed.ts";
import { createStoryCards, withStoryStickers } from "@/utils/story-cards.ts";
import { formatReportDate } from "@/utils/helper.ts";
import { loadSidebarUsers } from "@/loaders/sidebar-users.ts";

interface StoryFeedSourcesRuntime {
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  summaries: Pick<UserSummaryRepository, "findBySourceHash">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

interface StoryFeedRuntime extends StoryFeedSourcesRuntime {
  stories: Pick<
    StoryRepository,
    "findByMediaPk" | "listActive" | "listPublicationTimes" | "listPublishedBetween"
  >;
  users: Pick<InstagramUserRepository, "listAll">;
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
  repository: StoryFeedSourcesRuntime["appleVision"],
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

export function readStoryFeedSources(
  runtime: StoryFeedSourcesRuntime,
  users: Array<StoryOutputUser>,
): StoryFeedSources {
  const cachedImages = readCachedImages(users);
  const visionByPreviewUrl = readStoryFeedVision(runtime, users);
  const userSummaryByUserKey = readFeedUserSummaries(runtime, users);
  const appleCaptionByMediaPk = readAppleCaptions(users, runtime.appleVision);

  return {
    appleCaptionByMediaPk,
    cachedImages,
    userSummaryByUserKey,
    visionByPreviewUrl,
  };
}

export function loadStoryFeed(
  runtime: StoryFeedRuntime,
  now: Date = new Date(),
  selectedDate?: string,
  selectedStory?: string,
) {
  const {
    today,
    selectedDate: day,
    availableDates,
    users: feedUsers,
  } = createReportFeed(runtime, now, selectedDate, {
    selectedStory,
  });
  const sources = readStoryFeedSources(runtime, feedUsers);
  const sidebarUsers = loadSidebarUsers(runtime);
  const storedStories = feedUsers.flatMap((user) =>
    user.stories.flatMap(({ media_pk }) => {
      const story = runtime.stories.findByMediaPk(media_pk);
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
