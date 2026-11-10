import type { LocationMetadata } from "@@/core/domains/database/entities/location-metadata.ts";

const UNNAMED_PLACE = "Lieu sans nom";

export type MappableLocation = Extract<LocationMetadata, { status: "usable" }>;

export function isMappableTaggedPlace(location: LocationMetadata): location is MappableLocation {
  return location.status === "usable";
}

// The SQL id expression in `story-repository.tagged-places.ts` mirrors this format.
export function taggedPlaceId(location: { id: string; instagramPlaceId: string | null }): string {
  return location.instagramPlaceId === null
    ? `metadata:${location.id}`
    : `instagram:${location.instagramPlaceId}`;
}

export function taggedPlaceDisplayName(place: {
  name: string | null;
  address: string | null;
}): string {
  return place.name ?? place.address ?? UNNAMED_PLACE;
}
