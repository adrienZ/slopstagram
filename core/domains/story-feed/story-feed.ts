import type {
  StoryRepository,
  UserTimelineStory,
} from "@@/core/domains/database/repositories/story-repository.ts";
import type { StoryOutputUser } from "@@/core/domains/fetch-run/report-types.ts";
import type { VisionResult } from "@@/core/domains/database/entities/vision.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import { readCurrentVisionResult } from "@@/core/domains/vision/vision-analysis.ts";
import { getStoryDate, getStoryDayRange, storyDateSchema } from "./story-days.ts";

function getMediaType(value: number | undefined): "image" | "video" | null {
  if (value === 1) {
    return "image";
  }
  return value === 2 ? "video" : null;
}

export function createStoredStoryUser(
  latestStory: UserTimelineStory,
  stories: Array<UserTimelineStory>,
): StoryOutputUser {
  return {
    full_name: latestStory.full_name,
    profile_pic_url: `images/avatars/${latestStory.owner_pk}.jpg`,
    reel_ids: [],
    stories: stories.map((entry) => ({
      ig_caption: entry.story.accessibility_caption ?? "",
      locations: entry.locations,
      media_type: getMediaType(entry.story.media_type),
      media_pk: entry.story.pk,
      preview_image_url: `images/story-previews/${entry.story.pk}.jpg`,
      status: "ok",
      stickers: entry.stickers,
    })),
    username: latestStory.username,
  };
}

interface StoryFeedOptions {
  hasPreview?: (mediaPk: string) => boolean;
}

function groupStoryFeed(
  publishedStories: Array<UserTimelineStory>,
  previewExists?: (mediaPk: string) => boolean,
): Array<StoryOutputUser> {
  const entries = publishedStories
    .filter((entry) => previewExists?.(entry.story.pk) ?? true)
    .toSorted(
      (left, right) =>
        right.taken_at - left.taken_at ||
        left.username.localeCompare(right.username) ||
        left.story.pk.localeCompare(right.story.pk),
    );
  const byUser = new Map<string, Array<UserTimelineStory>>();
  for (const entry of entries) {
    const stories = byUser.get(entry.username) ?? [];
    stories.push(entry);
    byUser.set(entry.username, stories);
  }
  return [...byUser.values()].map((stories) =>
    createStoredStoryUser(
      stories[0],
      stories.toSorted(
        (left, right) =>
          left.taken_at - right.taken_at || left.story.pk.localeCompare(right.story.pk),
      ),
    ),
  );
}

export function createStoryFeed(
  runtime: { stories: Pick<StoryRepository, "listActive"> },
  now: Date,
  options: StoryFeedOptions = {},
): Array<StoryOutputUser> {
  return groupStoryFeed(runtime.stories.listActive(now), options.hasPreview);
}

export function createStoryDayFeed(
  runtime: { stories: Pick<StoryRepository, "listPublishedBetween"> },
  day: string,
  options: StoryFeedOptions = {},
): Array<StoryOutputUser> {
  const { start, end } = getStoryDayRange(day);
  return groupStoryFeed(runtime.stories.listPublishedBetween(start, end), options.hasPreview);
}

export function createReportFeed(
  runtime: {
    stories: Pick<StoryRepository, "listActive" | "listPublishedBetween" | "listPublicationTimes">;
  },
  now: Date,
  requestedDate?: string,
  options: StoryFeedOptions & { selectedStory?: string } = {},
) {
  const today = getStoryDate(now);
  const parsedDate = storyDateSchema.safeParse(requestedDate).data ?? today;
  let selectedDate = parsedDate > today ? today : parsedDate;
  let users =
    selectedDate === today
      ? createStoryFeed(runtime, now, options)
      : createStoryDayFeed(runtime, selectedDate, options);
  const publications = runtime.stories
    .listPublicationTimes(now)
    .filter(({ mediaPk }) => options.hasPreview?.(mediaPk) ?? true);
  const availableDates = new Set(
    publications.map(({ takenAt }) => getStoryDate(new Date(takenAt * 1000))),
  );
  availableDates.delete(today);
  if (publications.some(({ takenAt }) => takenAt > now.getTime() / 1000 - 86_400)) {
    availableDates.add(today);
  }
  if (
    options.selectedStory !== undefined &&
    !users.some((user) => user.stories.some((story) => story.media_pk === options.selectedStory))
  ) {
    const selectedStory = publications.find(({ mediaPk }) => mediaPk === options.selectedStory);
    if (selectedStory !== undefined) {
      selectedDate = getStoryDate(new Date(selectedStory.takenAt * 1000));
      users =
        selectedDate === today
          ? createStoryFeed(runtime, now, options)
          : createStoryDayFeed(runtime, selectedDate, options);
    }
  }
  return {
    today,
    selectedDate,
    availableDates: [...availableDates].toSorted((left, right) => left.localeCompare(right)),
    users,
  };
}

export function readStoryFeedVision(
  { vision: repository }: { vision: Pick<VisionRepository, "findByMediaPk"> },
  users: Array<StoryOutputUser>,
): Map<string, VisionResult> {
  const visionByPreviewUrl = new Map<string, VisionResult>();
  for (const story of users.flatMap((user) => user.stories)) {
    const result = readCurrentVisionResult(repository.findByMediaPk(story.media_pk));
    if (story.preview_image_url !== null && story.preview_image_url.length > 0 && result !== null) {
      visionByPreviewUrl.set(story.preview_image_url, result);
    }
  }
  return visionByPreviewUrl;
}
