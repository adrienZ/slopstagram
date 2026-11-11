import { and, countDistinct, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import type { DrizzleDatabase } from "../client.ts";
import { instagramUsers } from "../entities/instagram-user.ts";
import { metadataLocations, storyLocationObservations } from "../entities/location-metadata.ts";
import { stories } from "../entities/story.ts";

type TaggedPlaceDatabase = Pick<DrizzleDatabase, "select" | "selectDistinct">;

/** Mirrors `taggedPlaceId`; `tagged-place-rules.cross-check.test.ts` keeps the two equal. */
const placeId = sql<string>`case when ${metadataLocations.instagramPlaceId} is null then 'metadata:' || ${metadataLocations.id} else 'instagram:' || ${metadataLocations.instagramPlaceId} end`;

export interface TaggedPlaceRow {
  id: string;
  name: string | null;
  address: string | null;
  category: string | null;
  storyCount: number;
  /** Seconds since the epoch. */
  latestTakenAt: number;
  /** The usernames of the accounts that tagged the place, the latest first. */
  usernames: Array<string>;
}

export interface TaggedPlaceRowPage {
  places: Array<TaggedPlaceRow>;
  /** How many places match over every page. */
  total: number;
}

interface TaggedPlaceFilter {
  /** Only these accounts' stories, by exact username. */
  usernames?: Array<string>;
  ids?: Array<string>;
}

export interface TaggedPlacePageQuery extends TaggedPlaceFilter {
  offset: number;
  limit: number;
}

/** The stories tagging a place with coordinates, one row per observation. */
function selectTaggings(database: TaggedPlaceDatabase, { usernames, ids }: TaggedPlaceFilter) {
  return database
    .select({
      placeId: placeId.as("place_id"),
      name: metadataLocations.name,
      address: metadataLocations.address,
      category: metadataLocations.category,
      mediaPk: stories.mediaPk,
      takenAt: stories.takenAt,
      username: instagramUsers.username,
    })
    .from(storyLocationObservations)
    .innerJoin(metadataLocations, eq(storyLocationObservations.locationId, metadataLocations.id))
    .innerJoin(stories, eq(storyLocationObservations.mediaPk, stories.mediaPk))
    .innerJoin(instagramUsers, eq(stories.instagramUserPk, instagramUsers.pk))
    .where(
      and(
        isNotNull(metadataLocations.latitude),
        isNotNull(metadataLocations.longitude),
        isNotNull(stories.takenAt),
        usernames === undefined ? undefined : inArray(instagramUsers.username, usernames),
        ids === undefined ? undefined : inArray(placeId, ids),
      ),
    )
    .as("taggings");
}

/** A page of the tagged places with coordinates, the place of the latest story first. */
export function listTaggedPlaces(
  database: TaggedPlaceDatabase,
  { offset, limit, ...filter }: TaggedPlacePageQuery,
): TaggedPlaceRowPage {
  const taggings = selectTaggings(database, filter);
  const latestTakenAt = max(taggings.takenAt);
  const rows = database
    .select({
      id: taggings.placeId,
      name: taggings.name,
      address: taggings.address,
      category: taggings.category,
      storyCount: countDistinct(taggings.mediaPk),
      latestTakenAt,
    })
    .from(taggings)
    .groupBy(taggings.placeId)
    .orderBy(desc(latestTakenAt), taggings.placeId)
    .limit(limit)
    .offset(offset)
    .all();
  const total =
    database
      .select({ total: countDistinct(taggings.placeId) })
      .from(taggings)
      .get()?.total ?? 0;
  const pageTaggings = selectTaggings(database, { ...filter, ids: rows.map(({ id }) => id) });
  const ownerTakenAt = max(pageTaggings.takenAt);
  const owners = database
    .select({ id: pageTaggings.placeId, username: pageTaggings.username })
    .from(pageTaggings)
    .groupBy(pageTaggings.placeId, pageTaggings.username)
    .orderBy(desc(ownerTakenAt), pageTaggings.username)
    .all();
  return {
    places: rows.map((row) => ({
      ...row,
      latestTakenAt: row.latestTakenAt ?? 0,
      usernames: owners.flatMap(({ id, username }) => (id === row.id ? [username] : [])),
    })),
    total,
  };
}

/** The searchable text of every tagged place with coordinates, the place of the latest story first. */
export function listTaggedPlaceLabels(
  database: TaggedPlaceDatabase,
): Array<{ id: string; name: string | null; address: string | null; category: string | null }> {
  const taggings = selectTaggings(database, {});
  return database
    .select({
      id: taggings.placeId,
      name: taggings.name,
      address: taggings.address,
      category: taggings.category,
    })
    .from(taggings)
    .groupBy(taggings.placeId)
    .orderBy(desc(max(taggings.takenAt)), taggings.placeId)
    .all();
}

/** The latest stories tagging a place, the latest first. */
export function listTaggedPlaceStories(
  database: TaggedPlaceDatabase,
  id: string,
  limit: number,
): Array<{ takenAt: number; username: string }> {
  const taggings = selectTaggings(database, { ids: [id] });
  return database
    .selectDistinct({
      mediaPk: taggings.mediaPk,
      takenAt: taggings.takenAt,
      username: taggings.username,
    })
    .from(taggings)
    .orderBy(desc(taggings.takenAt), desc(taggings.mediaPk))
    .limit(limit)
    .all()
    .map(({ takenAt, username }) => ({ takenAt: takenAt ?? 0, username }));
}
