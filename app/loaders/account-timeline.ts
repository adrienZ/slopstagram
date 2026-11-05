import "@tanstack/react-start/server-only";
import { HTTPError } from "nitro/h3";
import type { StoryOutputUser } from "@@/core/domains/fetch-run/report-types.ts";
import type {
  UserTimelineStory,
  StoryRepository,
} from "@@/core/domains/database/repositories/story-repository.ts";
import type { VisionResult } from "@@/core/domains/database/entities/vision.ts";
import { createStoredStoryUser } from "@@/core/domains/story-feed/story-feed.ts";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import {
  describeOutdatedVision,
  type OutdatedVision,
} from "@@/core/domains/vision/vision-analysis.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";

import { getStoryDate } from "@@/core/domains/story-feed/story-days.ts";
import { createStoryCards, withStoryStickers } from "../utils/story-cards.ts";
import type { StoryCardData, StoryCardSources } from "../utils/story-cards.ts";
import { groupTimelineLocations } from "@@/core/domains/places/timeline-locations.ts";
import { groupTimelineStickers } from "../utils/timeline-stickers.ts";
import { loadSidebarUsers, type SidebarUser } from "./sidebar-users.ts";

interface TimelineDetailsRuntime {
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

interface UserTimelineRuntime extends TimelineDetailsRuntime {
  stories: Pick<StoryRepository, "listByUsername">;
  users: Pick<InstagramUserRepository, "findByUsername">;
}

interface AccountTimelineRuntime extends UserTimelineRuntime {
  stories: Pick<StoryRepository, "listByUsername" | "listStickerKinds">;
  users: Pick<InstagramUserRepository, "findByUsername" | "listAll">;
}

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

export interface UserTimelineYear {
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

function readTimelineDetails(
  runtime: TimelineDetailsRuntime,
  stories: Array<UserTimelineStory>,
): TimelineDetails {
  const appleCaptionByMediaPk = new Map<string, string>();
  const outdatedVisionByPreviewUrl = new Map<string, OutdatedVision>();
  const visionByPreviewUrl = new Map<string, VisionResult>();

  const details = stories.map((story) => ({
    appleCaption: runtime.appleVision.findByMediaPk(story.story.pk),
    previewUrl: getStoryPreviewSource(story),
    storyPk: story.story.pk,
    vision: runtime.vision.findByMediaPk(story.story.pk),
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
  runtime: UserTimelineRuntime,
  username: string,
): UserTimeline | null {
  const stories = runtime.stories.listByUsername(username);
  if (stories.length === 0) {
    const user = runtime.users.findByUsername(username);
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
  const details = readTimelineDetails(runtime, stories);

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

function getStoryCardSources(
  timeline: Pick<
    UserTimeline,
    | "appleCaptionByMediaPk"
    | "avatarPath"
    | "outdatedVisionByPreviewUrl"
    | "timelineUser"
    | "visionByPreviewUrl"
  >,
  previewPaths: Map<string, string>,
): StoryCardSources {
  const profilePicPathByUrl = new Map<string, string>();
  const profilePicUrl = timeline.timelineUser.profile_pic_url;

  if (profilePicUrl !== null && profilePicUrl !== undefined) {
    profilePicPathByUrl.set(profilePicUrl, timeline.avatarPath);
  }

  return {
    appleCaptionByMediaPk: timeline.appleCaptionByMediaPk,
    cachedImages: {
      profilePicPathByUrl,
      storyPreviewPathByUrl: previewPaths,
    },
    outdatedVisionByPreviewUrl: timeline.outdatedVisionByPreviewUrl,
    visionByPreviewUrl: timeline.visionByPreviewUrl,
  };
}

/** The story cards of one account's stories, with their stickers already presented. */
export function createOwnerStoryCards(
  runtime: TimelineDetailsRuntime,
  stories: Array<UserTimelineStory>,
  users: Array<SidebarUser>,
): Array<StoryCardData> {
  const first = stories.at(0);
  if (first === undefined) {
    return [];
  }
  const timelineUser = createStoredStoryUser(first, stories);
  const sources = getStoryCardSources(
    {
      ...readTimelineDetails(runtime, stories),
      avatarPath: `/media/avatars/${first.owner_pk}.jpg`,
      timelineUser,
    },
    getTimelinePreviewPaths(stories),
  );
  return withStoryStickers(createStoryCards(timelineUser, sources), stories, users);
}

export function loadAccountTimeline(
  runtime: AccountTimelineRuntime,
  username: string,
  now: Date = new Date(),
) {
  const timeline = createUserTimeline(runtime, username);
  if (timeline === null) {
    throw new HTTPError({ status: 404, message: `no published stories found for ${username}` });
  }
  const previewPaths = getTimelinePreviewPaths(timeline.stories);
  const sidebarUsers = loadSidebarUsers(runtime);
  const cards = withStoryStickers(
    createStoryCards(timeline.timelineUser, getStoryCardSources(timeline, previewPaths)),
    timeline.stories,
    sidebarUsers,
  );
  const cardByMediaPk = new Map(cards.map((card) => [card.mediaPk, card]));
  const stories = timeline.years.flatMap((year) =>
    year.months.flatMap((month) =>
      month.days.flatMap((day) =>
        day.stories.flatMap((entry) => {
          const card = cardByMediaPk.get(entry.story.pk);
          return card === undefined ? [] : [card];
        }),
      ),
    ),
  );

  return {
    today: getStoryDate(now),
    sidebarUsers,
    stickerGroups: groupTimelineStickers(timeline.stories, runtime.stories.listStickerKinds()),
    locations: groupTimelineLocations(timeline.stories),
    timeline: {
      avatarPath: timeline.avatarPath,
      timelineUser: timeline.timelineUser,
      stories: timeline.stories,
      years: timeline.years,
    },
    stories,
  };
}

export type AccountTimelinePageData = ReturnType<typeof loadAccountTimeline>;
