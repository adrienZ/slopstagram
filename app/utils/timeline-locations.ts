import {
  isMappableTaggedPlace,
  taggedPlaceDisplayName,
  taggedPlaceId,
} from "@@/core/domains/places/tagged-place-rules.ts";
import type { UserTimelineStory } from "@@/core/domains/database/repositories/story-repository.ts";

export interface TimelinePlace {
  id: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  stories: Array<{ mediaPk: string; date: string; username: string }>;
}

export interface TimelineLocations {
  places: Array<TimelinePlace>;
  unpositionedStickerCount: number;
  unpositionedLocationCount: number;
}

// The place a step away from the selected one, wrapping around the list.
export function adjacentPlaceId(
  places: Array<TimelinePlace>,
  selectedId: string,
  step: 1 | -1,
): string | undefined {
  const index = places.findIndex((place) => place.id === selectedId);
  return index === -1 ? undefined : places[(index + step + places.length) % places.length]?.id;
}

export function groupTimelineLocations(stories: Array<UserTimelineStory>): TimelineLocations {
  const places = new Map<string, TimelinePlace>();
  let unpositionedStickerCount = 0;
  let unpositionedLocationCount = 0;
  for (const entry of stories.toSorted((left, right) => right.taken_at - left.taken_at)) {
    const { annotations } = entry.story;
    const observations = annotations?.locationObservations ?? [];
    const stickers = annotations?.stickers.filter((sticker) => sticker.kind === "location") ?? [];
    const positionedOccurrences = new Set(
      observations.flatMap((observation) =>
        isMappableTaggedPlace(observation.metadata) && observation.occurrenceId !== null
          ? [observation.occurrenceId]
          : [],
      ),
    );
    // Story-level provenance permits mapping an unlinked observation, but does
    // not establish coordinates for any particular legacy sticker label.
    unpositionedStickerCount += stickers.filter(
      (sticker) =>
        sticker.occurrenceId === undefined || !positionedOccurrences.has(sticker.occurrenceId),
    ).length;
    for (const { metadata } of observations) {
      if (!isMappableTaggedPlace(metadata)) {
        unpositionedLocationCount += 1;
        continue;
      }
      const id = taggedPlaceId(metadata);
      const place = places.get(id) ?? {
        id,
        name: taggedPlaceDisplayName(metadata),
        category: metadata.category,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        stories: [],
      };
      if (!place.stories.some((story) => story.mediaPk === entry.story.pk)) {
        place.stories.push({
          mediaPk: entry.story.pk,
          date: new Date(entry.taken_at * 1000).toISOString(),
          username: entry.username,
        });
      }
      places.set(id, place);
    }
  }
  return { places: [...places.values()], unpositionedStickerCount, unpositionedLocationCount };
}
