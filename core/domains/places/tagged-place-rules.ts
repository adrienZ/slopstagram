import type { LocationMetadata } from "@@/core/domains/database/entities/location-metadata.ts";

/** The name of a place that has no name nor address, as the map shows it. */
const UNNAMED_PLACE = "Lieu sans nom";

/** A stored location that is mappable: Usable sticker metadata, with a valid latitude and longitude. */
export type MappableLocation = Extract<LocationMetadata, { status: "usable" }>;

/**
 * Whether a stored location can be put on the map: it has Usable sticker metadata, a valid
 * latitude and longitude. A partial location never is.
 */
export function isMappableTaggedPlace(location: LocationMetadata): location is MappableLocation {
  return location.status === "usable";
}

/**
 * The id of a Tagged place: its Instagram place id when Instagram gave one, else the stored
 * location's own id. Opaque to callers. The SQL id expression in
 * `story-repository.tagged-places.ts` mirrors it.
 */
export function taggedPlaceId(location: { id: string; instagramPlaceId: string | null }): string {
  return location.instagramPlaceId === null
    ? `metadata:${location.id}`
    : `instagram:${location.instagramPlaceId}`;
}

/** The name shown for a Tagged place: its name, else its address, else the unnamed-place label. */
export function taggedPlaceDisplayName(place: {
  name: string | null;
  address: string | null;
}): string {
  return place.name ?? place.address ?? UNNAMED_PLACE;
}
