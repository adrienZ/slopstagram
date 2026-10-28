import { musicStickerItems, type MusicStickerItem } from "./music-preview.ts";
import type { StoryAnnotations, UserTimelineStory } from "../sdk/lib/types.ts";
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
  labels: Array<{ key: string; label: string; category?: string }>;
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

// Location stickers do not carry their place's category: it comes from the
// place lookup linked to the sticker occurrence.
export function locationCategories(annotations: StoryAnnotations | undefined) {
  const categories = new Map<string, string>();
  for (const { occurrenceId, metadata } of annotations?.locationObservations ?? []) {
    const category = metadata.category?.trim();
    if (occurrenceId !== null && category !== undefined && category.length > 0) {
      categories.set(occurrenceId, category);
    }
  }
  return categories;
}

export function groupTimelineStickers(
  stories: Array<UserTimelineStory>,
  availableKinds: Array<string>,
): Array<StickerKindGroup> {
  const kinds = new Map(availableKinds.map((kind) => [kind, new Map<string, StoryStickerGroup>()]));
  const occurrences = stories
    .toSorted((left, right) => right.taken_at - left.taken_at)
    .flatMap((entry) => {
      const categories = locationCategories(entry.story.annotations);
      return (entry.story.annotations?.stickers ?? []).map((sticker, position) => ({
        entry,
        sticker,
        key: `${entry.story.pk}:${position}`,
        category:
          sticker.kind === "location" && sticker.occurrenceId !== undefined
            ? categories.get(sticker.occurrenceId)
            : undefined,
      }));
    });

  for (const { entry, sticker, key, category } of occurrences) {
    const byStory = kinds.get(sticker.kind) ?? new Map<string, StoryStickerGroup>();
    const group = byStory.get(entry.story.pk) ?? {
      mediaPk: entry.story.pk,
      date: new Date(entry.taken_at * 1000).toISOString(),
      labels: [],
    };
    const label = { key, label: sticker.label, category };
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
