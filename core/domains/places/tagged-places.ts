import { z } from "zod";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type {
  StoryRepository,
  TaggedPlaceRow,
} from "@@/core/domains/database/repositories/story-repository.ts";
import { taggedPlaceDisplayName } from "@@/core/domains/places/tagged-place-rules.ts";
import { normalizeSearchQuery, rankTextMatch } from "@@/core/utils/search-text.ts";

/** What reading the Tagged places needs. */
export interface TaggedPlacesReadRuntime {
  stories: Pick<
    StoryRepository,
    "listTaggedPlaceLabels" | "listTaggedPlaceStories" | "listTaggedPlaces"
  >;
}

/** What listing the Tagged places needs: the saved accounts too, to filter by them. */
export interface TaggedPlacesRuntime extends TaggedPlacesReadRuntime {
  users: Pick<InstagramUserRepository, "findByUsername">;
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

const TaggedPlaceSummarySchema = z.object({
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
interface TaggedPlaceDetails extends TaggedPlaceSummary {
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

function formatHandle(username: string): string {
  return `@${username}`;
}

function formatDate(takenAt: number): string {
  return new Date(takenAt * 1000).toISOString();
}

function summarize(place: TaggedPlaceRow): TaggedPlaceSummary {
  return {
    id: place.id,
    name: taggedPlaceDisplayName(place),
    category: place.category,
    storyCount: place.storyCount,
    latestStoryDate: formatDate(place.latestTakenAt),
    owners: place.usernames.map(formatHandle),
  };
}

function toPage(places: Array<TaggedPlaceRow>, total: number, offset: number): TaggedPlacePage {
  const end = offset + PLACE_PAGE_SIZE;
  return {
    places: places.map(summarize),
    total,
    nextOffset: end < total ? end : null,
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
  { usernames, offset = 0 }: { usernames?: Array<string>; offset?: number } = {},
): TaggedPlaceList {
  const requested = (usernames ?? []).map((name) => ({
    name,
    account: runtime.users.findByUsername(normalizeSearchQuery(name)),
  }));
  const { places, total } = runtime.stories.listTaggedPlaces({
    usernames:
      usernames === undefined || usernames.length === 0
        ? undefined
        : requested.flatMap(({ account }) => account?.username ?? []),
    offset,
    limit: PLACE_PAGE_SIZE,
  });
  return {
    ...toPage(places, total, offset),
    unknownUsernames: requested.flatMap(({ name, account }) => (account === null ? [name] : [])),
  };
}

/**
 * A page of the Tagged places whose name, address or category contains the query, ignoring
 * case, accents and a leading `@`: exact matches first, then prefixes, then the others, each
 * the place of the latest story first.
 */
export function searchTaggedPlaces(
  runtime: TaggedPlacesReadRuntime,
  { query, offset = 0 }: { query: string; offset?: number },
): TaggedPlacePage {
  const wanted = normalizeSearchQuery(query);
  const matches =
    wanted === ""
      ? []
      : runtime.stories.listTaggedPlaceLabels().flatMap((label) => {
          const ranks = [label.name, label.address, label.category].flatMap((text) => {
            const rank = text === null ? null : rankTextMatch(text, wanted);
            return rank === null ? [] : [rank];
          });
          return ranks.length === 0 ? [] : [{ id: label.id, rank: Math.min(...ranks) }];
        });
  const ids = matches
    .toSorted((left, right) => left.rank - right.rank)
    .slice(offset, offset + PLACE_PAGE_SIZE)
    .map(({ id }) => id);
  const { places } =
    ids.length === 0
      ? { places: [] }
      : runtime.stories.listTaggedPlaces({ ids, offset: 0, limit: PLACE_PAGE_SIZE });
  return toPage(
    places.toSorted((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id)),
    matches.length,
    offset,
  );
}

/** The details of the Tagged place with this id, or `unknown`. */
export function getTaggedPlace(runtime: TaggedPlacesReadRuntime, id: string): TaggedPlaceRead {
  const wanted = id.trim();
  const place = runtime.stories
    .listTaggedPlaces({ ids: [wanted], offset: 0, limit: 1 })
    .places.at(0);
  if (place === undefined) {
    return { status: "unknown", id };
  }
  return {
    status: "found",
    place: {
      ...summarize(place),
      address: place.address,
      latestStories: runtime.stories
        .listTaggedPlaceStories(wanted, LATEST_STORY_COUNT)
        .map(({ takenAt, username }) => ({
          date: formatDate(takenAt),
          owner: formatHandle(username),
        })),
      hasMoreStories: place.storyCount > LATEST_STORY_COUNT,
    },
  };
}
