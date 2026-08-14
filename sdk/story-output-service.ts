import { getLargestVersion } from "./lib/parser-service.ts";
import { NO_ACCESSIBILITY_CAPTION } from "./lib/report-constants.ts";
import { STORY_MEDIA_TYPES } from "./lib/types.ts";
import type {
  StoryItem,
  StoryManifestItem,
  StoryManifestReel,
  StoryMediaType,
  StoryOutputUser,
  StoryTrayEntry,
} from "./lib/types.ts";
import { getStoryLocations, getStoryStickers } from "./story-sticker-location-service.ts";

function getAccessibilityCaption(mediaPk: string, cachedItems: Map<string, StoryItem>): string {
  const caption = cachedItems.get(mediaPk)?.accessibility_caption;

  return typeof caption === "string" && caption.trim().length > 0
    ? caption
    : NO_ACCESSIBILITY_CAPTION;
}

function getStoryPreviewImageUrl(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): string | null {
  const story = cachedItems.get(mediaPk);
  const candidate = getLargestVersion(story?.image_versions2?.candidates);

  return candidate?.url ?? null;
}

function getStoryMediaType(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
): StoryMediaType | null {
  const mediaType = cachedItems.get(mediaPk)?.media_type;

  if (mediaType === 1) {
    return STORY_MEDIA_TYPES.IMAGE;
  }

  if (mediaType === 2) {
    return STORY_MEDIA_TYPES.VIDEO;
  }

  return null;
}

function createManifestStory(
  mediaPk: string,
  cachedItems: Map<string, StoryItem>,
  failureByMediaPk: Map<string, number>,
): StoryManifestItem {
  const failureIndex = failureByMediaPk.get(mediaPk);

  return {
    ...(failureIndex === undefined ? {} : { failure_index: failureIndex }),
    ig_caption: getAccessibilityCaption(mediaPk, cachedItems),
    locations: getStoryLocations(mediaPk, cachedItems),
    media_type: getStoryMediaType(mediaPk, cachedItems),
    media_pk: mediaPk,
    preview_image_url: getStoryPreviewImageUrl(mediaPk, cachedItems),
    stickers: getStoryStickers(mediaPk, cachedItems),
    status: failureIndex === undefined ? "ok" : "failed",
  };
}

export function createManifestUsers(
  tray: StoryTrayEntry[],
  cachedItems: Map<string, StoryItem>,
  failureByMediaPk: Map<string, number>,
): StoryManifestReel[] {
  return tray.map((entry, order) => ({
    full_name: entry.user.full_name ?? entry.full_name ?? null,
    id: entry.user.id ?? entry.id,
    media_ids: entry.media_ids,
    order,
    pk: entry.user.pk ?? entry.user.id ?? entry.id,
    profile_pic_url: entry.user.profile_pic_url ?? null,
    reel_id: entry.id,
    stories: entry.media_ids.map((mediaPk) =>
      createManifestStory(mediaPk, cachedItems, failureByMediaPk),
    ),
    username: entry.user.username,
  }));
}

function appendOutputUserStories(group: StoryOutputUser, user: StoryManifestReel): void {
  group.reel_ids.push(user.reel_id);
  group.stories.push(
    ...user.stories.map((story) => ({
      ...(story.failure_index === undefined ? {} : { failure_index: story.failure_index }),
      ig_caption: story.ig_caption,
      locations: story.locations,
      media_type: story.media_type ?? null,
      media_pk: story.media_pk,
      preview_image_url: story.preview_image_url,
      stickers: story.stickers,
      status: story.status,
    })),
  );
}

function createOutputUser(user: StoryManifestReel): StoryOutputUser {
  return {
    full_name: user.full_name,
    profile_pic_url: user.profile_pic_url,
    reel_ids: [],
    stories: [],
    username: user.username,
  };
}

export function createOutputUsers(manifestUsers: StoryManifestReel[]): StoryOutputUser[] {
  const outputUsers: StoryOutputUser[] = [];
  const groupByUser = new Map<string, StoryOutputUser>();

  for (const user of manifestUsers) {
    const existingGroup = groupByUser.get(user.username);
    const group = existingGroup ?? createOutputUser(user);

    if (!existingGroup) {
      groupByUser.set(user.username, group);
      outputUsers.push(group);
    }

    appendOutputUserStories(group, user);
  }

  return outputUsers;
}
