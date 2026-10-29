import type { StoryOutputUser } from "../sdk/report-types.ts";
import {
  type UserTimelineStory,
  type StoryRepository,
  storyRepository,
} from "../sdk/repositories/story-repository.ts";
import type { VisionResult } from "../sdk/entities/vision.ts";
import { createStoredStoryUser } from "../sdk/story-feed.ts";
import { appleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import { describeOutdatedVision, type OutdatedVision } from "../sdk/lib/vision-analysis-service.ts";
import {
  instagramUserRepository,
  type InstagramUserRepository,
} from "../sdk/repositories/instagram-user-repository.ts";

const PARIS_TIME_ZONE = "Europe/Paris";

interface UserTimelineDay {
  key: string;
  label: string;
  stories: Array<UserTimelineStory>;
}

interface UserTimelineMonth {
  key: string;
  label: string;
  days: Array<UserTimelineDay>;
}

interface UserTimelineYear {
  label: string;
  months: Array<UserTimelineMonth>;
}

export interface UserTimeline {
  appleCaptionByMediaPk: Map<string, string>;
  avatarPath: string;
  stories: Array<UserTimelineStory>;
  outdatedVisionByPreviewUrl: Map<string, OutdatedVision>;
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

/**
 * Test seam: tests group stories without a database.
 * @public
 */
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

interface TimelineDetails {
  appleCaptionByMediaPk: Map<string, string>;
  outdatedVisionByPreviewUrl: Map<string, OutdatedVision>;
  visionByPreviewUrl: Map<string, VisionResult>;
}

function readTimelineDetails(stories: Array<UserTimelineStory>): TimelineDetails {
  const appleCaptionByMediaPk = new Map<string, string>();
  const outdatedVisionByPreviewUrl = new Map<string, OutdatedVision>();
  const visionByPreviewUrl = new Map<string, VisionResult>();

  const details = stories.map((story) => ({
    appleCaption: appleVisionRepository.findByMediaPk(story.story.pk),
    previewUrl: getStoryPreviewSource(story),
    storyPk: story.story.pk,
    vision: visionRepository.findByMediaPk(story.story.pk),
  }));

  for (const { appleCaption, previewUrl, storyPk, vision } of details) {
    if (appleCaption !== null) {
      appleCaptionByMediaPk.set(storyPk, appleCaption);
    }
    if (vision !== null) {
      visionByPreviewUrl.set(previewUrl, vision.result);
      const outdated = describeOutdatedVision(vision);
      if (outdated !== null) {
        outdatedVisionByPreviewUrl.set(previewUrl, outdated);
      }
    }
  }

  return { appleCaptionByMediaPk, outdatedVisionByPreviewUrl, visionByPreviewUrl };
}

export function createUserTimeline(
  username: string,
  repository: Pick<StoryRepository, "listByUsername"> = storyRepository,
  users: Pick<InstagramUserRepository, "findByUsername"> = instagramUserRepository,
): UserTimeline | null {
  const stories = repository.listByUsername(username);
  if (stories.length === 0) {
    const user = users.findByUsername(username);
    if (user === null) {
      return null;
    }
    return {
      appleCaptionByMediaPk: new Map(),
      avatarPath: `/media/avatars/${user.pk}.jpg`,
      outdatedVisionByPreviewUrl: new Map(),
      stories: [],
      timelineUser: {
        username: user.username,
        full_name: user.full_name,
        profile_pic_url: `images/avatars/${user.pk}.jpg`,
        reel_ids: [],
        stories: [],
      },
      visionByPreviewUrl: new Map(),
      years: [],
    };
  }

  const timelineUser = createStoredStoryUser(stories[0], stories);
  const details = readTimelineDetails(stories);

  return {
    ...details,
    avatarPath: `/media/avatars/${stories[0].owner_pk}.jpg`,
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
