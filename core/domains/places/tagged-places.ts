import { z } from "zod";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import { normalizeSearchQuery, rankTextMatch } from "@@/core/utils/search-text.ts";
import { groupTimelineLocations, type TimelinePlace } from "./timeline-locations.ts";

/** What reading the Tagged places needs. */
export interface TaggedPlacesReadRuntime {
  stories: Pick<StoryRepository, "listWithLocationObservations">;
}

/** What listing the Tagged places needs: the saved accounts too, to filter by them. */
export interface TaggedPlacesRuntime extends TaggedPlacesReadRuntime {
  users: Pick<InstagramUserRepository, "listAll">;
}

/** How many places a page of places holds. */
const PLACE_PAGE_SIZE = 10;
/** How many of its latest stories the details of a place list. */
const LATEST_STORY_COUNT = 5;

/** A Tagged place, as a list or a search of places gives it. */
export interface TaggedPlaceSummary {
  /** Opaque: `instagram:<id>` or `metadata:<id>`, to copy as is. */
  id: string;
  name: string;
  category: string | null;
  storyCount: number;
  /** ISO date of the latest story tagging the place. */
  latestStoryDate: string;
  /** The accounts that tagged the place, as `@username`, the latest first. */
  owners: Array<string>;
}

export const TaggedPlaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  storyCount: z.number(),
  latestStoryDate: z.string(),
  owners: z.array(z.string()),
}) satisfies z.ZodType<TaggedPlaceSummary>;

/** One page of places, the place of the latest story first. */
export interface TaggedPlacePage {
  places: Array<TaggedPlaceSummary>;
  /** How many places there are over every page. */
  total: number;
  /** The offset of the next page, or null on the last page. */
  nextOffset: number | null;
}

/** The input of a page of places: the offset of the page, the first one when left out. */
export const PlaceOffsetSchema = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('The "nextOffset" of the previous page, to read the next one. Leave it out first.');

export const TaggedPlacePageSchema = z.object({
  places: z.array(TaggedPlaceSummarySchema),
  total: z.number(),
  nextOffset: z.number().nullable(),
}) satisfies z.ZodType<TaggedPlacePage>;

/** A Tagged place with its address and its latest stories. */
export interface TaggedPlaceDetails extends TaggedPlaceSummary {
  address: string | null;
  /** The latest stories tagging the place, the latest first. */
  latestStories: Array<{ date: string; owner: string }>;
  /** Whether older stories tag the place too. */
  hasMoreStories: boolean;
}

const TaggedPlaceDetailsSchema = TaggedPlaceSummarySchema.extend({
  address: z.string().nullable(),
  latestStories: z.array(z.object({ date: z.string(), owner: z.string() })),
  hasMoreStories: z.boolean(),
}) satisfies z.ZodType<TaggedPlaceDetails>;

export type TaggedPlaceRead =
  | { status: "found"; place: TaggedPlaceDetails }
  | { status: "unknown"; id: string };

export const TaggedPlaceReadSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("found"), place: TaggedPlaceDetailsSchema }),
  z.object({ status: z.literal("unknown"), id: z.string() }),
]) satisfies z.ZodType<TaggedPlaceRead>;

/** Every Tagged place with usable coordinates, all time, the place of the latest story first. */
function readTaggedPlaces(runtime: TaggedPlacesReadRuntime): Array<TimelinePlace> {
  return groupTimelineLocations(runtime.stories.listWithLocationObservations()).places;
}

function formatHandle(username: string): string {
  return `@${username}`;
}

function summarize(place: TimelinePlace): TaggedPlaceSummary {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    storyCount: place.stories.length,
    latestStoryDate: place.stories[0]?.date ?? "",
    owners: [...new Set(place.stories.map(({ username }) => formatHandle(username)))],
  };
}

function paginate(places: Array<TimelinePlace>, offset = 0): TaggedPlacePage {
  const end = offset + PLACE_PAGE_SIZE;
  return {
    places: places.slice(offset, end).map(summarize),
    total: places.length,
    nextOffset: end < places.length ? end : null,
  };
}

export interface TaggedPlaceList extends TaggedPlacePage {
  /** The requested usernames that are no saved account, as written. */
  unknownUsernames: Array<string>;
}

/**
 * A page of the Tagged places. With usernames, only the places at least one of those accounts
 * tagged, each keeping only their stories, ignoring case and a leading `@`.
 */
export function listTaggedPlaces(
  runtime: TaggedPlacesRuntime,
  { usernames = [], offset }: { usernames?: Array<string>; offset?: number } = {},
): TaggedPlaceList {
  const places = readTaggedPlaces(runtime);
  if (usernames.length === 0) {
    return { ...paginate(places, offset), unknownUsernames: [] };
  }
  const saved = new Map(
    runtime.users.listAll().map(({ username }) => [username.toLowerCase(), username]),
  );
  const requested = usernames.map((name) => ({
    name,
    username: saved.get(normalizeSearchQuery(name)),
  }));
  const chosen = new Set(requested.flatMap(({ username }) => username ?? []));
  const chosenPlaces = places.flatMap((place) => {
    const stories = place.stories.filter(({ username }) => chosen.has(username));
    return stories.length === 0 ? [] : [{ ...place, stories }];
  });
  return {
    ...paginate(chosenPlaces, offset),
    unknownUsernames: requested.flatMap(({ name, username }) =>
      username === undefined ? [name] : [],
    ),
  };
}

/**
 * A page of the Tagged places whose name, address or category contains the query, ignoring
 * case, accents and a leading `@`: exact matches first, then prefixes, then the others, each
 * the place of the latest story first.
 */
export function searchTaggedPlaces(
  runtime: TaggedPlacesReadRuntime,
  { query, offset }: { query: string; offset?: number },
): TaggedPlacePage {
  const wanted = normalizeSearchQuery(query);
  if (wanted === "") {
    return paginate([], offset);
  }
  const matches = readTaggedPlaces(runtime).flatMap((place) => {
    const ranks = [place.name, place.address, place.category].flatMap((text) => {
      const rank = text === null ? null : rankTextMatch(text, wanted);
      return rank === null ? [] : [rank];
    });
    return ranks.length === 0 ? [] : [{ place, rank: Math.min(...ranks) }];
  });
  matches.sort((left, right) => left.rank - right.rank);
  return paginate(
    matches.map(({ place }) => place),
    offset,
  );
}

/** The details of the Tagged place with this id, or `unknown`. */
export function getTaggedPlace(runtime: TaggedPlacesReadRuntime, id: string): TaggedPlaceRead {
  const place = readTaggedPlaces(runtime).find((candidate) => candidate.id === id.trim());
  if (place === undefined) {
    return { status: "unknown", id };
  }
  return {
    status: "found",
    place: {
      ...summarize(place),
      address: place.address,
      latestStories: place.stories
        .slice(0, LATEST_STORY_COUNT)
        .map(({ date, username }) => ({ date, owner: formatHandle(username) })),
      hasMoreStories: place.stories.length > LATEST_STORY_COUNT,
    },
  };
}
