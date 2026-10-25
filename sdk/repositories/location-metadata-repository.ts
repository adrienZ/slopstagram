import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import {
  metadataLocations,
  partialMetadataLocations,
  storyLocationObservations,
  type LocationFields,
  type LocationMetadata,
  type StoryLocationObservation,
} from "../entities/location-metadata.ts";
import type { StoryAnnotations, StoryItem } from "../lib/types.ts";
import {
  getLocationSourceUpdates,
  type LocationObservationInput,
} from "../location-observation-service.ts";
import { getStoryAnnotationUpdates } from "../story-sticker-location-service.ts";

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

function mergeFields(
  previous: LocationFields | undefined,
  incoming: LocationFields,
): LocationFields {
  const known = previous ?? incoming;
  return {
    instagramPlaceId: incoming.instagramPlaceId ?? known.instagramPlaceId,
    name: incoming.name ?? known.name,
    address: incoming.address ?? known.address,
    latitude: incoming.latitude ?? known.latitude,
    longitude: incoming.longitude ?? known.longitude,
    facebookPlacesId: incoming.facebookPlacesId ?? known.facebookPlacesId,
    externalSource: incoming.externalSource ?? known.externalSource,
  };
}

function saveMetadata(
  database: LocationDatabase,
  observation: LocationObservationInput,
  previous?: StoryLocationObservation,
) {
  const { instagramPlaceId } = observation.fields;
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
  const known = usable ?? partial ?? previous?.metadata;
  const fields = mergeFields(
    mergeFields(previous?.metadata, known ?? observation.fields),
    observation.fields,
  );
  const id = known?.id ?? randomUUID();
  if (fields.latitude !== null && fields.longitude !== null) {
    const entry = { ...fields, latitude: fields.latitude, longitude: fields.longitude, id };
    database
      .insert(metadataLocations)
      .values(entry)
      .onConflictDoUpdate({ target: metadataLocations.id, set: entry })
      .run();
    const partialIds = new Set([
      partial?.id,
      previous?.metadata.status === "partial" ? previous.metadata.id : undefined,
    ]);
    for (const partialId of partialIds) {
      if (partialId === undefined) {
        continue;
      }
      database
        .update(storyLocationObservations)
        .set({ locationId: id, partialLocationId: null })
        .where(eq(storyLocationObservations.partialLocationId, partialId))
        .run();
      database
        .delete(partialMetadataLocations)
        .where(eq(partialMetadataLocations.id, partialId))
        .run();
    }
    return { locationId: id, partialLocationId: null };
  }
  database
    .insert(partialMetadataLocations)
    .values({ ...fields, id })
    .onConflictDoUpdate({ target: partialMetadataLocations.id, set: fields })
    .run();
  return { locationId: null, partialLocationId: id };
}

function findPreviousObservation(
  previous: Array<StoryLocationObservation>,
  observation: LocationObservationInput,
  occurrenceId: string | undefined,
  uniqueProvider: boolean,
  retained: Set<string>,
): StoryLocationObservation | undefined {
  const candidates = previous.filter(
    (entry) =>
      (observation.providerOccurrenceId !== null &&
        entry.providerOccurrenceId === observation.providerOccurrenceId) ||
      (occurrenceId !== undefined && entry.occurrenceId === occurrenceId),
  );
  if (candidates.length !== 1 || retained.has(candidates[0].id)) {
    return undefined;
  }
  return uniqueProvider || candidates[0].occurrenceId === occurrenceId ? candidates[0] : undefined;
}

function compatiblePlace(previous: StoryLocationObservation | undefined, fields: LocationFields) {
  if (previous === undefined) {
    return previous;
  }
  const knownId = previous.metadata.instagramPlaceId;
  return knownId === null || fields.instagramPlaceId === null || knownId === fields.instagramPlaceId
    ? previous
    : undefined;
}

function findObservedSticker(
  story: StoryItem,
  observation: LocationObservationInput,
  stickers: StoryAnnotations["stickers"],
  incoming: StoryAnnotations["stickers"],
  labeledIndex: number,
) {
  const matches =
    observation.providerOccurrenceId === null
      ? []
      : stickers.filter((entry) => entry.providerOccurrenceId === observation.providerOccurrenceId);
  if (matches.length === 1) {
    return matches[0];
  }
  if (
    story.annotations === undefined &&
    (observation.fields.name !== null || observation.fields.address !== null)
  ) {
    return incoming[labeledIndex];
  }
  return null;
}

export function enrichStoryLocations(
  database: LocationDatabase,
  story: StoryItem,
  annotations: StoryAnnotations,
): void {
  const malformed = new Set<string>();
  const updates = getStoryAnnotationUpdates(story, (source) => {
    malformed.add(source);
  });
  const replaced = new Set(
    updates.filter((update) => update.preservePrevious !== true).map(({ source }) => source),
  );
  for (const { source, observations } of getLocationSourceUpdates(story)) {
    if (malformed.has(source)) {
      continue;
    }
    const previous = readLocationObservations(database, story.pk).filter(
      (entry) => entry.source === source,
    );
    const retained = new Set<string>();
    const stickers = annotations.stickers.filter(
      (entry) => entry.kind === "location" && entry.source === source,
    );
    const incomingCount =
      updates
        .find((update) => update.source === source)
        ?.stickers.filter((sticker) => sticker.kind === "location").length ?? 0;
    // During this live save, incoming contributions are appended after retained
    // ones. This uses the current extraction order, never a previous dense index.
    const incomingStickers = incomingCount === 0 ? [] : stickers.slice(-incomingCount);
    let labeledIndex = 0;
    for (const [sortOrder, observation] of observations.entries()) {
      const { providerOccurrenceId, fields } = observation;
      const labeled = fields.name !== null || fields.address !== null;
      const sticker = findObservedSticker(
        story,
        observation,
        stickers,
        incomingStickers,
        labeledIndex,
      );
      if (labeled) {
        labeledIndex += 1;
      }
      const uniqueProvider =
        providerOccurrenceId !== null &&
        observations.filter((entry) => entry.providerOccurrenceId === providerOccurrenceId)
          .length === 1;
      const old = findPreviousObservation(
        previous,
        observation,
        sticker?.occurrenceId,
        uniqueProvider,
        retained,
      );
      // A provider occurrence can be reused for a changed place. Never merge the
      // old place's fields unless its shared identity agrees or was unknown.
      const metadata = saveMetadata(database, observation, compatiblePlace(old, fields));
      const id = old?.id ?? randomUUID();
      retained.add(id);
      const entry = {
        id,
        mediaPk: story.pk,
        source,
        sortOrder,
        providerOccurrenceId,
        occurrenceId: sticker?.occurrenceId ?? old?.occurrenceId ?? null,
        ...metadata,
      };
      database
        .insert(storyLocationObservations)
        .values(entry)
        .onConflictDoUpdate({ target: storyLocationObservations.id, set: entry })
        .run();
    }
    for (const old of previous) {
      if (replaced.has(source) && !retained.has(old.id)) {
        database
          .delete(storyLocationObservations)
          .where(eq(storyLocationObservations.id, old.id))
          .run();
      }
    }
  }
}
