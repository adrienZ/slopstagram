import { asc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  metadataLocations,
  partialMetadataLocations,
  storyLocationObservations,
  type LocationMetadata,
  type StoryLocationObservation,
} from "../entities/location-metadata.ts";
import type { StoryAnnotations, StoryItem } from "../lib/types.ts";
import type { LocationObservationInput } from "../location-observation-service.ts";
import {
  planLocationMetadataWrite,
  planStoryLocationUpdates,
} from "../location-metadata-service.ts";

type LocationDatabase = Pick<DrizzleDatabase, "select" | "insert" | "update" | "delete">;

export function readLocationObservations(
  database: LocationDatabase,
  mediaPk: string,
): Array<StoryLocationObservation> {
  const rows = database
    .select()
    .from(storyLocationObservations)
    .leftJoin(metadataLocations, eq(storyLocationObservations.locationId, metadataLocations.id))
    .leftJoin(
      partialMetadataLocations,
      eq(storyLocationObservations.partialLocationId, partialMetadataLocations.id),
    )
    .where(eq(storyLocationObservations.mediaPk, mediaPk))
    .orderBy(asc(storyLocationObservations.source), asc(storyLocationObservations.sortOrder))
    .all();
  return rows.flatMap(
    ({
      story_location_observations: observation,
      metadata_location: location,
      metadata_location_partial: partial,
    }) => {
      let metadata: LocationMetadata | null = null;
      if (location !== null) {
        metadata = { ...location, status: "usable" };
      } else if (partial !== null) {
        metadata = { ...partial, status: "partial" };
      }
      return metadata
        ? [
            {
              id: observation.id,
              source: observation.source,
              occurrenceId: observation.occurrenceId,
              providerOccurrenceId: observation.providerOccurrenceId,
              metadata,
            },
          ]
        : [];
    },
  );
}

export function saveLocationMetadata(
  database: LocationDatabase,
  observation: LocationObservationInput,
  previous?: StoryLocationObservation,
  fillMissing = false,
) {
  const instagramPlaceId =
    observation.fields.instagramPlaceId ?? previous?.metadata.instagramPlaceId ?? null;
  const usable =
    instagramPlaceId === null
      ? undefined
      : database
          .select()
          .from(metadataLocations)
          .where(eq(metadataLocations.instagramPlaceId, instagramPlaceId))
          .get();
  const partial =
    instagramPlaceId === null
      ? undefined
      : database
          .select()
          .from(partialMetadataLocations)
          .where(eq(partialMetadataLocations.instagramPlaceId, instagramPlaceId))
          .get();
  const plan = planLocationMetadataWrite(observation, { usable, partial }, previous, fillMissing);
  const { entry } = plan;
  if (plan.status === "usable") {
    database
      .insert(metadataLocations)
      .values(plan.entry)
      .onConflictDoUpdate({ target: metadataLocations.id, set: plan.entry })
      .run();
    for (const partialId of plan.promotedPartialIds) {
      database
        .update(storyLocationObservations)
        .set({ locationId: entry.id, partialLocationId: null })
        .where(eq(storyLocationObservations.partialLocationId, partialId))
        .run();
      database
        .delete(partialMetadataLocations)
        .where(eq(partialMetadataLocations.id, partialId))
        .run();
    }
    return { locationId: entry.id, partialLocationId: null };
  }
  database
    .insert(partialMetadataLocations)
    .values(entry)
    .onConflictDoUpdate({ target: partialMetadataLocations.id, set: entry })
    .run();
  return { locationId: null, partialLocationId: entry.id };
}

export function enrichStoryLocations(
  database: LocationDatabase,
  story: StoryItem,
  annotations: StoryAnnotations,
): void {
  const previous = readLocationObservations(database, story.pk);
  const plan = planStoryLocationUpdates(story, annotations, previous);
  for (const write of plan.writes) {
    const metadata = saveLocationMetadata(database, write.observation, write.previous);
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
