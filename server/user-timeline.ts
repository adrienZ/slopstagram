import {
  STORY_MEDIA_TYPES,
  type StoryOutputUser,
  type UserTimelineStory,
  type VisionResult,
} from "../sdk/lib/types.ts";
import type { StoryRepository } from "../sdk/entities/story.ts";
import {
  appleVisionRepository,
  storyRepository,
  visionRepository,
} from "../sdk/lib/entity-repository-service.ts";

const PARIS_TIME_ZONE = "Europe/Paris";

export interface UserTimelineDay {
  key: string;
  label: string;
  stories: Array<UserTimelineStory>;
}

export interface UserTimelineMonth {
  key: string;
  label: string;
  days: Array<UserTimelineDay>;
}

export interface UserTimelineYear {
  label: string;
  months: Array<UserTimelineMonth>;
}

export interface UserTimeline {
  appleCaptionByMediaPk: Map<string, string>;
  avatarPath: string | null;
  stories: Array<UserTimelineStory>;
  timelineUser: StoryOutputUser;
  visionByPreviewUrl: Map<string, VisionResult>;
  years: Array<UserTimelineYear>;
}

interface DateParts {
  day: string;
  month: string;
  year: string;
}

function formatDateParts(date: Date): DateParts {
  const values = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  return {
    day: values.find((part) => part.type === "day")?.value ?? "",
    month: values.find((part) => part.type === "month")?.value ?? "",
    year: values.find((part) => part.type === "year")?.value ?? "",
  };
}

function getDateKeyParts(date: Date): DateParts {
  const values = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  return {
    day: values.find((part) => part.type === "day")?.value ?? "",
    month: values.find((part) => part.type === "month")?.value ?? "",
    year: values.find((part) => part.type === "year")?.value ?? "",
  };
}

function getTimelineDate(story: UserTimelineStory): Date | null {
  const date = new Date(story.taken_at * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function groupStoriesByPublishedDate(
  stories: Array<UserTimelineStory>,
): Array<UserTimelineYear> {
  const years = new Map<string, Map<string, { days: Array<UserTimelineDay>; label: string }>>();

  for (const story of stories) {
    const date = getTimelineDate(story);
    if (date === null) {
      continue;
    }

    const { day, month, year } = formatDateParts(date);
    const keys = getDateKeyParts(date);
    const monthKey = `${keys.year}-${keys.month}`;
    const dayKey = `${monthKey}-${keys.day}`;
    const months =
      years.get(year) ?? new Map<string, { days: Array<UserTimelineDay>; label: string }>();
    const monthEntry = months.get(monthKey) ?? { days: [], label: month };
    const { days } = monthEntry;
    const currentDay = days.find((entry) => entry.key === dayKey);

    if (currentDay === undefined) {
      days.push({ key: dayKey, label: day, stories: [story] });
    } else {
      currentDay.stories.push(story);
    }

    months.set(monthKey, monthEntry);
    years.set(year, months);
  }

  return [...years]
    .toSorted(([left], [right]) => right.localeCompare(left))
    .map(([year, months]) => ({
      label: year,
      months: [...months]
        .toSorted(([left], [right]) => right.localeCompare(left))
        .map(([key, month]) => ({
          key,
          label: month.label,
          days: month.days.toSorted((left, right) => right.key.localeCompare(left.key)),
        })),
    }));
}

function getStoryPreviewSource(story: UserTimelineStory): string {
  return `images/story-previews/${story.story.pk}.jpg`;
}

function getStoryMediaType(story: UserTimelineStory): "image" | "video" | null {
  if (story.story.media_type === 1) {
    return STORY_MEDIA_TYPES.IMAGE;
  }
  if (story.story.media_type === 2) {
    return STORY_MEDIA_TYPES.VIDEO;
  }
  return null;
}

function createTimelineUser(
  latestStory: UserTimelineStory,
  stories: Array<UserTimelineStory>,
): StoryOutputUser {
  return {
    full_name: latestStory.full_name,
    profile_pic_url:
      latestStory.owner_pk === null ? null : `images/avatars/${latestStory.owner_pk}.jpg`,
    reel_ids: [],
    stories: stories.map((entry) => ({
      ig_caption: entry.story.accessibility_caption ?? "",
      locations: entry.locations,
      media_type: getStoryMediaType(entry),
      media_pk: entry.story.pk,
      preview_image_url: getStoryPreviewSource(entry),
      status: "ok",
      stickers: entry.stickers,
    })),
    username: latestStory.username,
  };
}

async function readTimelineDetails(stories: Array<UserTimelineStory>): Promise<{
  appleCaptionByMediaPk: Map<string, string>;
  visionByPreviewUrl: Map<string, VisionResult>;
}> {
  const appleCaptionByMediaPk = new Map<string, string>();
  const visionByPreviewUrl = new Map<string, VisionResult>();

  for (const story of stories) {
    const [appleCaption, vision] = await Promise.all([
      appleVisionRepository.findByMediaPk(story.story.pk),
      visionRepository.findByMediaPk(story.story.pk),
    ]);
    if (appleCaption !== null) {
      appleCaptionByMediaPk.set(story.story.pk, appleCaption);
    }
    if (vision !== null) {
      visionByPreviewUrl.set(getStoryPreviewSource(story), vision.result);
    }
  }

  return { appleCaptionByMediaPk, visionByPreviewUrl };
}

export async function createUserTimeline(
  username: string,
  repository: Pick<StoryRepository, "listByUsername"> = storyRepository,
): Promise<UserTimeline | null> {
  const stories = await repository.listByUsername(username);
  if (stories.length === 0) {
    return null;
  }

  const timelineUser = createTimelineUser(stories[0], stories);
  const details = await readTimelineDetails(stories);
  const avatarPath = timelineUser.profile_pic_url?.replace(/^images\//u, "/media/") ?? null;

  return {
    ...details,
    avatarPath,
    stories,
    timelineUser,
    years: groupStoriesByPublishedDate(stories),
  };
}

export function getTimelinePreviewPaths(stories: Array<UserTimelineStory>): Map<string, string> {
  return new Map(
    stories.map((story) => [
      getStoryPreviewSource(story),
      `/media/${getStoryPreviewSource(story).slice(7)}`,
    ]),
  );
}
