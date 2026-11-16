import { z } from "zod";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type {
  StoryRepository,
  TaggedPlaceRow,
} from "@@/core/domains/database/repositories/story-repository.ts";
import { taggedPlaceDisplayName } from "@@/core/domains/places/tagged-place-rules.ts";
import { nextOffsetAfter } from "@@/core/utils/paging.ts";
import { normalizeSearchQuery, rankTextMatch } from "@@/core/utils/search-text.ts";

export interface TaggedPlacesReadRuntime {
  stories: Pick<
    StoryRepository,
    "listTaggedPlaceLabels" | "listTaggedPlaceStories" | "listTaggedPlaces"
  >;
}

export interface TaggedPlacesRuntime extends TaggedPlacesReadRuntime {
  users: Pick<InstagramUserRepository, "findByUsername">;
}

const PLACE_PAGE_SIZE = 10;
const LATEST_STORY_COUNT = 5;

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

export interface TaggedPlacePage {
  places: Array<TaggedPlaceSummary>;
  total: number;
  nextOffset: number | null;
}

export const TaggedPlacePageSchema = z.object({
  places: z.array(TaggedPlaceSummarySchema),
  total: z.number(),
  nextOffset: z.number().nullable(),
}) satisfies z.ZodType<TaggedPlacePage>;

interface TaggedPlaceDetails extends TaggedPlaceSummary {
  address: string | null;
  latestStories: Array<{ date: string; owner: string }>;
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
  return {
    places: places.map(summarize),
    total,
    nextOffset: nextOffsetAfter(offset, PLACE_PAGE_SIZE, total),
  };
}

export interface TaggedPlaceList extends TaggedPlacePage {
  unknownUsernames: Array<string>;
}

/** Each place keeps only the given accounts' stories. */
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

/** Exact matches first, then prefixes, then the others. */
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
