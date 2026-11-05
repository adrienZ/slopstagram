import type { TimelinePlace } from "@@/core/domains/places/timeline-locations.ts";

// The place a step away from the selected one, wrapping around the list.
export function adjacentPlaceId(
  places: Array<TimelinePlace>,
  selectedId: string,
  step: 1 | -1,
): string | undefined {
  const index = places.findIndex((place) => place.id === selectedId);
  return index === -1 ? undefined : places[(index + step + places.length) % places.length]?.id;
}
