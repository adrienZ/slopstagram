import { musicStickerItems, type MusicStickerItem } from "./music-preview.ts";
import type { StoryAnnotations } from "../sdk/story-types.ts";
import type { UserTimelineStory } from "../sdk/repositories/story-repository.ts";
import { formatUserHandle } from "./helper.ts";

const stickerKindOrder = new Map([
  ["location", 0],
  ["mention", 1],
  ["link", 2],
  ["music", 3],
  ["hashtag", 4],
]);

export interface StoryStickerGroup {
  mediaPk: string;
  date: string;
  labels: Array<{ key: string; label: string; place?: StickerPlace }>;
  musicItems?: Array<MusicStickerItem>;
}

export interface StickerKindGroup {
  kind: string;
  stories: Array<StoryStickerGroup>;
}

export function formatStickerStoryDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(date));
}

export function formatStickerLabel(kind: string, label: string): string {
  if (kind === "mention") {
    return formatUserHandle(label);
  }
  if (kind !== "link" || !globalThis.URL.canParse(label)) {
    return label;
  }
  const url = new globalThis.URL(label);
  return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
}

export interface StickerPlace {
  category?: string;
  hasCoordinates: boolean;
}

// Location stickers do not carry their place: it comes from the observation
// linked to the sticker occurrence. A sticker without one has no coordinates.
export function stickerPlaces(annotations: StoryAnnotations | undefined) {
  const places = new Map<string, StickerPlace>();
  for (const { occurrenceId, metadata } of annotations?.locationObservations ?? []) {
    if (occurrenceId === null) {
      continue;
    }
    const category = metadata.category?.trim();
    places.set(occurrenceId, {
      category: category === undefined || category.length === 0 ? undefined : category,
      hasCoordinates: metadata.status === "usable",
    });
  }
  return places;
}

export function stickerPlace(
  places: Map<string, StickerPlace>,
  sticker: { kind: string; occurrenceId?: string },
): StickerPlace | undefined {
  if (sticker.kind !== "location") {
    return undefined;
  }
  return (
    (sticker.occurrenceId === undefined ? undefined : places.get(sticker.occurrenceId)) ?? {
      hasCoordinates: false,
    }
  );
}

export function groupTimelineStickers(
  stories: Array<UserTimelineStory>,
  availableKinds: Array<string>,
): Array<StickerKindGroup> {
  const kinds = new Map(availableKinds.map((kind) => [kind, new Map<string, StoryStickerGroup>()]));
  const occurrences = stories
    .toSorted((left, right) => right.taken_at - left.taken_at)
    .flatMap((entry) => {
      const places = stickerPlaces(entry.story.annotations);
      return (entry.story.annotations?.stickers ?? []).map((sticker, position) => ({
        entry,
        sticker,
        key: `${entry.story.pk}:${position}`,
        place: stickerPlace(places, sticker),
      }));
    });

  for (const { entry, sticker, key, place } of occurrences) {
    const byStory = kinds.get(sticker.kind) ?? new Map<string, StoryStickerGroup>();
    const group = byStory.get(entry.story.pk) ?? {
      mediaPk: entry.story.pk,
      date: new Date(entry.taken_at * 1000).toISOString(),
      labels: [],
    };
    const label = { key, label: sticker.label, place };
    group.labels.push(label);
    byStory.set(entry.story.pk, group);
    kinds.set(sticker.kind, byStory);
  }

  for (const entry of stories.toSorted((left, right) => right.taken_at - left.taken_at)) {
    const items = musicStickerItems(entry.story.annotations);
    if (items.length === 0) {
      continue;
    }
    const byStory = kinds.get("music") ?? new Map<string, StoryStickerGroup>();
    const group = byStory.get(entry.story.pk) ?? {
      mediaPk: entry.story.pk,
      date: new Date(entry.taken_at * 1000).toISOString(),
      labels: [],
    };
    group.musicItems = items;
    byStory.set(entry.story.pk, group);
    kinds.set("music", byStory);
  }

  return [...kinds]
    .toSorted(
      ([left], [right]) =>
        (stickerKindOrder.get(left) ?? stickerKindOrder.size) -
          (stickerKindOrder.get(right) ?? stickerKindOrder.size) || left.localeCompare(right),
    )
    .map(([kind, byStory]) => ({
      kind,
      stories: [...byStory.values()].toSorted((left, right) => right.date.localeCompare(left.date)),
    }));
}
