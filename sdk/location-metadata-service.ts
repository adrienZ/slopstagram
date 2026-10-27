import { randomUUID } from "node:crypto";
import {
  PlaceDetailsSchema,
  type metadataLocations,
  type LocationFields,
  type PlaceDetails,
  type StoryLocationObservation,
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
    city: incoming.city ?? known.city,
    latitude: incoming.latitude ?? known.latitude,
    longitude: incoming.longitude ?? known.longitude,
    facebookPlacesId: incoming.facebookPlacesId ?? known.facebookPlacesId,
    externalSource: incoming.externalSource ?? known.externalSource,
  };
}

export interface PlaceDetailsInput {
  phone?: string | null;
  priceRange?: number | null;
  slug?: string | null;
  business?: {
    id?: string | null;
    username?: string | null;
    pictureUrl?: string | null;
  } | null;
}

export interface PlaceFillInput {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
}

// Place details are written only by lookups; a lookup without details leaves the stored ones.
export interface PlaceLookupInput extends PlaceFillInput {
  details?: PlaceDetailsInput;
}

// A location sticker found by a lookup reads like the ones observed in stories: name, then address.
export function locationStickerLabel(place: { name: string | null; address: string | null }) {
  const label = [place.name, place.address].filter((part) => part !== null).join(", ");
  return label.length > 0 ? label : null;
}

const MAX_LOOKUP_FAILURE_LENGTH = 2000;

// The raw error text is kept, only bounded in length.
export function boundLookupFailure(error: string) {
  return error.slice(0, MAX_LOOKUP_FAILURE_LENGTH);
}

function fillText(known: string | null, incoming: string | null | undefined) {
  if (known !== null || incoming === null || incoming === undefined) {
    return known;
  }
  return incoming.trim().length > 0 ? incoming : null;
}

function fillCoordinate(known: number | null, incoming: number | null | undefined, bound: number) {
  if (known !== null || incoming === null || incoming === undefined) {
    return known;
  }
  return Math.abs(incoming) <= bound ? incoming : null;
}

function presentText(value: string | null | undefined) {
  return value !== null && value !== undefined && value.trim().length > 0 ? value : null;
}

// Lookup-only values keep Instagram's wording as received: no lookup response keeps the known
// value, otherwise the lookup replaces it and an empty value clears it.
function replacedByLookup(known: string | null, incoming: string | null | undefined) {
  return incoming === undefined ? known : presentText(incoming);
}

// Empty strings from Instagram are missing values; a place without a business account has none.
export function planPlaceDetails(incoming: PlaceDetailsInput): PlaceDetails {
  return PlaceDetailsSchema.parse({
    phone: presentText(incoming.phone),
    priceRange: incoming.priceRange ?? null,
    slug: presentText(incoming.slug),
    businessAccountId: presentText(incoming.business?.id),
    businessAccountUsername: presentText(incoming.business?.username),
    businessAccountPictureUrl: presentText(incoming.business?.pictureUrl),
  });
}

// Fill-only: a known value always wins, and the place's identifiers never change.
// The category and zip code are the exception: they come only from lookups, so the latest one replaces them.
export function planPlaceFill(
  known: typeof metadataLocations.$inferSelect,
  incoming: PlaceFillInput,
) {
  return {
    name: fillText(known.name, incoming.name),
    address: fillText(known.address, incoming.address),
    city: fillText(known.city, incoming.city),
    zip: replacedByLookup(known.zip, incoming.zip),
    latitude: fillCoordinate(known.latitude, incoming.latitude, 90),
    longitude: fillCoordinate(known.longitude, incoming.longitude, 180),
    category: replacedByLookup(known.category, incoming.category),
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
