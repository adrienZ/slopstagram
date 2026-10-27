import { randomUUID } from "node:crypto";
import type {
  metadataLocations,
  LocationFields,
  StoryLocationObservation,
} from "./entities/location-metadata.ts";
import type { StoryAnnotations, StoryItem } from "./lib/types.ts";
import {
  getLocationSourceUpdates,
  type LocationObservationInput,
} from "./location-observation-service.ts";
import { getStoryAnnotationUpdates } from "./story-sticker-location-service.ts";

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

export function planLocationMetadataWrite(
  observation: LocationObservationInput,
  known: typeof metadataLocations.$inferSelect | undefined,
  previous?: StoryLocationObservation,
) {
  const fields = mergeFields(
    mergeFields(previous?.metadata, known ?? observation.fields),
    observation.fields,
  );
  return { ...fields, id: known?.id ?? previous?.metadata.id ?? randomUUID() };
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

interface LocationObservationWrite {
  entry: {
    id: string;
    mediaPk: string;
    source: string;
    sortOrder: number;
    providerOccurrenceId: string | null;
    occurrenceId: string | null;
  };
  observation: LocationObservationInput;
  previous: StoryLocationObservation | undefined;
}

export function planStoryLocationUpdates(
  story: StoryItem,
  annotations: StoryAnnotations,
  previousObservations: Array<StoryLocationObservation>,
) {
  const writes: Array<LocationObservationWrite> = [];
  const removedObservationIds: Array<string> = [];
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
    const previous = previousObservations.filter((entry) => entry.source === source);
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
      const id = old?.id ?? randomUUID();
      retained.add(id);
      const entry = {
        id,
        mediaPk: story.pk,
        source,
        sortOrder,
        providerOccurrenceId,
        occurrenceId: sticker?.occurrenceId ?? old?.occurrenceId ?? null,
      };
      writes.push({ entry, observation, previous: compatiblePlace(old, fields) });
    }
    for (const old of previous) {
      if (replaced.has(source) && !retained.has(old.id)) {
        removedObservationIds.push(old.id);
      }
    }
  }
  return { writes, removedObservationIds };
}
