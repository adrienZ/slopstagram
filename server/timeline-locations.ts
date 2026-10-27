import type { UserTimelineStory } from "../sdk/lib/types.ts";

export interface TimelinePlace {
  id: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  stories: Array<{ mediaPk: string; date: string }>;
}

export interface TimelineLocations {
  places: Array<TimelinePlace>;
  unpositionedStickerCount: number;
  unpositionedLocationCount: number;
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
        observation.metadata.status === "usable" && observation.occurrenceId !== null
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
      if (metadata.status !== "usable") {
        unpositionedLocationCount += 1;
        continue;
      }
      const id =
        metadata.instagramPlaceId === null
          ? `metadata:${metadata.id}`
          : `instagram:${metadata.instagramPlaceId}`;
      const place = places.get(id) ?? {
        id,
        name: metadata.name ?? metadata.address ?? "Lieu sans nom",
        category: metadata.category,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        stories: [],
      };
      if (!place.stories.some((story) => story.mediaPk === entry.story.pk)) {
        place.stories.push({
          mediaPk: entry.story.pk,
          date: new Date(entry.taken_at * 1000).toISOString(),
        });
      }
      places.set(id, place);
    }
  }
  return { places: [...places.values()], unpositionedStickerCount, unpositionedLocationCount };
}
