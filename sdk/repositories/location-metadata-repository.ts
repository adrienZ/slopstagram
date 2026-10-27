import { asc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  metadataLocations,
  storyLocationObservations,
  classifyLocation,
  type StoryLocationObservation,
} from "../entities/location-metadata.ts";
import type { StoryAnnotations, StoryItem } from "../lib/types.ts";
import type { LocationObservationInput } from "../location-observation-service.ts";
import {
  planLocationMetadataWrite,
  planPlaceFill,
  planStoryLocationUpdates,
  type PlaceFillInput,
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
): void {
  const known = database
    .select()
    .from(metadataLocations)
    .where(eq(metadataLocations.instagramPlaceId, instagramPlaceId))
    .get();
  if (known === undefined) {
    return;
  }
  const update: Partial<typeof metadataLocations.$inferInsert> = planPlaceFill(known, incoming);
  if (lookedUpAt !== undefined) {
    update.lastLookupAttemptAt = lookedUpAt;
  }
  database.update(metadataLocations).set(update).where(eq(metadataLocations.id, known.id)).run();
}
