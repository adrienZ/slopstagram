import type { UserTimelineStory } from "../sdk/lib/types.ts";

export interface TimelinePlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stories: Array<{ mediaPk: string; date: string }>;
}

export interface TimelineLocations {
  places: Array<TimelinePlace>;
  unpositionedCount: number;
}

export function groupTimelineLocations(stories: Array<UserTimelineStory>): TimelineLocations {
  const places = new Map<string, TimelinePlace>();
  let unpositionedCount = 0;
  for (const entry of stories.toSorted((left, right) => right.taken_at - left.taken_at)) {
    const { annotations } = entry.story;
    const observations = annotations?.locationObservations ?? [];
    const stickers = annotations?.stickers.filter((sticker) => sticker.kind === "location") ?? [];
    // Legacy labels can outnumber the observations. Count the missing evidence,
    // without inventing occurrence links for ambiguous cache observations.
    unpositionedCount += Math.max(0, stickers.length - observations.length);
    for (const { metadata } of observations) {
      if (metadata.status !== "usable") {
        unpositionedCount += 1;
        continue;
      }
      const id =
        metadata.instagramPlaceId === null
          ? `metadata:${metadata.id}`
          : `instagram:${metadata.instagramPlaceId}`;
      const place = places.get(id) ?? {
        id,
        name: metadata.name ?? metadata.address ?? "Lieu sans nom",
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
  return { places: [...places.values()], unpositionedCount };
}
