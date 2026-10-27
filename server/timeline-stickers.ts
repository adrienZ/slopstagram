import type { UserTimelineStory } from "../sdk/lib/types.ts";
import { formatUserHandle, getUserTimelineUrl } from "./helper.ts";

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
  labels: Array<{ key: string; label: string }>;
}

export interface StickerKindGroup {
  kind: string;
  stories: Array<StoryStickerGroup>;
}

export function getMentionProfileUrl(
  kind: string,
  label: string,
  usernames: Array<string>,
): string | undefined {
  if (kind !== "mention") {
    return undefined;
  }
  const mentionedUsername = label.trim().replace(/^@/u, "").toLowerCase();
  const username = usernames.find((candidate) => candidate.toLowerCase() === mentionedUsername);
  return username === undefined ? undefined : getUserTimelineUrl(username);
}

export function formatStickerStoryDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
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

export function groupTimelineStickers(
  stories: Array<UserTimelineStory>,
  availableKinds: Array<string>,
): Array<StickerKindGroup> {
  const kinds = new Map(availableKinds.map((kind) => [kind, new Map<string, StoryStickerGroup>()]));
  const occurrences = stories
    .toSorted((left, right) => right.taken_at - left.taken_at)
    .flatMap((entry) =>
      (entry.story.annotations?.stickers ?? []).map((sticker, position) => ({
        entry,
        sticker,
        key: `${entry.story.pk}:${position}`,
      })),
    );

  for (const { entry, sticker, key } of occurrences) {
    const byStory = kinds.get(sticker.kind) ?? new Map<string, StoryStickerGroup>();
    const group = byStory.get(entry.story.pk) ?? {
      mediaPk: entry.story.pk,
      date: new Date(entry.taken_at * 1000).toISOString(),
      labels: [],
    };
    group.labels.push({ key, label: sticker.label });
    byStory.set(entry.story.pk, group);
    kinds.set(sticker.kind, byStory);
  }

  return [...kinds]
    .toSorted(
      ([left], [right]) =>
        (stickerKindOrder.get(left) ?? stickerKindOrder.size) -
          (stickerKindOrder.get(right) ?? stickerKindOrder.size) || left.localeCompare(right),
    )
    .map(([kind, byStory]) => ({ kind, stories: [...byStory.values()] }));
}
