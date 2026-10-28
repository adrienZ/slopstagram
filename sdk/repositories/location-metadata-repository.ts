import { and, asc, eq, isNull } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  metadataLocationDetails,
  metadataLocations,
  storyLocationObservations,
  classifyLocation,
  type PlaceDetails,
  type StoryLocationObservation,
} from "../entities/location-metadata.ts";
import { storyStickers } from "../entities/story.ts";
import type { StoryAnnotations, StoryItem } from "../lib/types.ts";
import type { LocationObservationInput } from "../location-observation-service.ts";
import {
  planLocationMetadataWrite,
  boundLookupFailure,
  planPlaceDetails,
  isSameLabel,
  locationStickerLabel,
  planPlaceFill,
  planStoryLocationUpdates,
  type PlaceFillInput,
  type PlaceLookupInput,
} from "../location-metadata-service.ts";

type LocationDatabase = Pick<DrizzleDatabase, "select" | "insert" | "update" | "delete">;

export function readLocationObservations(
  database: LocationDatabase,
  mediaPk: string,
): Array<StoryLocationObservation> {
  const rows = database
    .select()
    .from(storyLocationObservations)
    .innerJoin(metadataLocations, eq(storyLocationObservations.locationId, metadataLocations.id))
    .where(eq(storyLocationObservations.mediaPk, mediaPk))
    .orderBy(asc(storyLocationObservations.source), asc(storyLocationObservations.sortOrder))
    .all();
  return rows.map(({ story_location_observations: observation, metadata_location: location }) => ({
    id: observation.id,
    source: observation.source,
    occurrenceId: observation.occurrenceId,
    providerOccurrenceId: observation.providerOccurrenceId,
    metadata: classifyLocation(location),
  }));
}

function saveMetadata(
  database: LocationDatabase,
  observation: LocationObservationInput,
  previous?: StoryLocationObservation,
) {
  const identifier =
    observation.fields.instagramPlaceId ?? previous?.metadata.instagramPlaceId ?? null;
  const known =
    identifier === null
      ? undefined
      : database
          .select()
          .from(metadataLocations)
          .where(eq(metadataLocations.instagramPlaceId, identifier))
          .get();
  const entry = planLocationMetadataWrite(observation, known, previous);
  database
    .insert(metadataLocations)
    .values(entry)
    .onConflictDoUpdate({ target: metadataLocations.id, set: entry })
    .run();
  if (previous && previous.metadata.id !== entry.id) {
    database
      .update(storyLocationObservations)
      .set({ locationId: entry.id })
      .where(eq(storyLocationObservations.locationId, previous.metadata.id))
      .run();
    database.delete(metadataLocations).where(eq(metadataLocations.id, previous.metadata.id)).run();
  }
  return { locationId: entry.id };
}

export function enrichStoryLocations(
  database: LocationDatabase,
  story: StoryItem,
  annotations: StoryAnnotations,
): void {
  const previous = readLocationObservations(database, story.pk);
  const plan = planStoryLocationUpdates(story, annotations, previous);
  for (const write of plan.writes) {
    const metadata = saveMetadata(database, write.observation, write.previous);
    const entry = { ...write.entry, ...metadata };
    database
      .insert(storyLocationObservations)
      .values(entry)
      .onConflictDoUpdate({ target: storyLocationObservations.id, set: entry })
      .run();
  }
  for (const id of plan.removedObservationIds) {
    database.delete(storyLocationObservations).where(eq(storyLocationObservations.id, id)).run();
  }
}

export function fillTaggedPlace(
  database: LocationDatabase,
  instagramPlaceId: string,
  incoming: PlaceFillInput,
  lookedUpAt?: number,
): string | null {
  const known = database
    .select()
    .from(metadataLocations)
    .where(eq(metadataLocations.instagramPlaceId, instagramPlaceId))
    .get();
  if (known === undefined) {
    return null;
  }
  const update: Partial<typeof metadataLocations.$inferInsert> = planPlaceFill(known, incoming);
  if (lookedUpAt !== undefined) {
    update.lastLookupAttemptAt = lookedUpAt;
    update.lastLookupFailure = null;
  }
  database.update(metadataLocations).set(update).where(eq(metadataLocations.id, known.id)).run();
  return known.id;
}

// Stories saved with only a place id show a sticker whose label the payload never carried.
// Once the place is named, give each such observation the location sticker it stands for:
// one the story already shows under the place's name, or else a new one.
function labelObservedStickers(database: LocationDatabase, locationId: string): void {
  const unlinked = database
    .select({ observation: storyLocationObservations, place: metadataLocations })
    .from(storyLocationObservations)
    .innerJoin(metadataLocations, eq(storyLocationObservations.locationId, metadataLocations.id))
    .where(
      and(
        eq(storyLocationObservations.locationId, locationId),
        isNull(storyLocationObservations.occurrenceId),
      ),
    )
    .all();
  for (const { observation, place } of unlinked) {
    const label = locationStickerLabel(place);
    if (label === null) {
      continue;
    }
    const shown = database
      .select({
        occurrenceId: storyStickers.occurrenceId,
        sortOrder: storyStickers.sortOrder,
        kind: storyStickers.kind,
        label: storyStickers.label,
      })
      .from(storyStickers)
      .where(eq(storyStickers.mediaPk, observation.mediaPk))
      .all();
    const claimed = new Set(
      database
        .select({ occurrenceId: storyLocationObservations.occurrenceId })
        .from(storyLocationObservations)
        .where(eq(storyLocationObservations.mediaPk, observation.mediaPk))
        .all()
        .map((entry) => entry.occurrenceId),
    );
    const names = [label, place.name].filter((name) => name !== null);
    const matching = shown.filter(
      (sticker) =>
        sticker.kind === "location" && names.some((name) => isSameLabel(sticker.label, name)),
    );
    if (matching.length > 0) {
      const unclaimed = matching.find((sticker) => !claimed.has(sticker.occurrenceId));
      if (unclaimed !== undefined) {
        database
          .update(storyLocationObservations)
          .set({ occurrenceId: unclaimed.occurrenceId })
          .where(eq(storyLocationObservations.id, observation.id))
          .run();
      }
      continue;
    }
    const sticker = {
      kind: "location",
      label,
      mediaPk: observation.mediaPk,
      sortOrder: Math.max(-1, ...shown.map(({ sortOrder }) => sortOrder)) + 1,
      source: observation.source,
      providerOccurrenceId: observation.providerOccurrenceId,
    };
    const { occurrenceId } = database
      .insert(storyStickers)
      .values(sticker)
      .returning({ occurrenceId: storyStickers.occurrenceId })
      .get();
    database
      .update(storyLocationObservations)
      .set({ occurrenceId })
      .where(eq(storyLocationObservations.id, observation.id))
      .run();
  }
}

export function recordPlaceLookup(
  database: LocationDatabase,
  instagramPlaceId: string,
  incoming: PlaceLookupInput,
  lookedUpAt: number,
): void {
  const { details: incomingDetails, ...place } = incoming;
  const locationId = fillTaggedPlace(database, instagramPlaceId, place, lookedUpAt);
  if (locationId === null) {
    return;
  }
  labelObservedStickers(database, locationId);
  if (incomingDetails !== undefined) {
    const details = { locationId, ...planPlaceDetails(incomingDetails) };
    database
      .insert(metadataLocationDetails)
      .values(details)
      .onConflictDoUpdate({ target: metadataLocationDetails.locationId, set: details })
      .run();
  }
}

// A failed lookup keeps every known value and only records when it happened and why.
export function recordFailedPlaceLookup(
  database: LocationDatabase,
  instagramPlaceId: string,
  error: string,
  attemptedAt: number,
): void {
  database
    .update(metadataLocations)
    .set({ lastLookupAttemptAt: attemptedAt, lastLookupFailure: boundLookupFailure(error) })
    .where(eq(metadataLocations.instagramPlaceId, instagramPlaceId))
    .run();
}

export function readPlaceDetails(
  database: LocationDatabase,
  instagramPlaceId: string,
): PlaceDetails | null {
  const row = database
    .select()
    .from(metadataLocationDetails)
    .innerJoin(metadataLocations, eq(metadataLocationDetails.locationId, metadataLocations.id))
    .where(eq(metadataLocations.instagramPlaceId, instagramPlaceId))
    .get();
  if (row === undefined) {
    return null;
  }
  const { locationId: _locationId, ...details } = row.metadata_location_details;
  return details;
}
