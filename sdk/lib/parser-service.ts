import type { StoryRepository } from "../entities/story.ts";
import {
  STORY_MEDIA_TYPES,
  type ParsedStory,
  type ParsedStoryTrayUser,
  type StoriesMediaReport,
  type StoriesManifestReport,
  type StoriesReport,
  type StoryItem,
  type StoryMediaType,
  type StoryTrayEntry,
  type StoryVersion,
} from "./types.ts";

export function getLargestVersion<T extends StoryVersion>(
  versions: T[] | null | undefined,
): T | null {
  if (!versions || versions.length === 0) {
    return null;
  }

  return versions.reduce((largest, version) => {
    const largestArea = (largest.width ?? 0) * (largest.height ?? 0);
    const versionArea = (version.width ?? 0) * (version.height ?? 0);

    if (versionArea > largestArea) {
      return version;
    }

    return largest;
  });
}

function getStoryMediaType(value: number | undefined): StoryMediaType {
  if (value === 1) {
    return STORY_MEDIA_TYPES.IMAGE;
  }

  if (value === 2) {
    return STORY_MEDIA_TYPES.VIDEO;
  }

  throw new Error(`Unsupported story media_type: ${String(value)}`);
}

function isStoriesManifestReport(
  report: StoriesMediaReport | StoriesManifestReport | StoriesReport,
): report is StoriesManifestReport {
  return "manifest" in report && "metadata" in report;
}

function findStoryItem(report: StoriesMediaReport, pk: string): StoryItem {
  const graphItems =
    report.data?.xdt_api__v1__feed__reels_media__connection?.edges?.flatMap(
      (edge) => edge.node?.items ?? [],
    ) ?? [];
  const reelsItems = Object.values(report.reels ?? {}).flatMap((reel) => reel.items ?? []);
  const items = [...graphItems, ...reelsItems];

  const item = items.find((entry) => entry.pk === pk);

  if (!item) {
    throw new Error(`Story with pk ${pk} not found`);
  }

  return item;
}

export function getStoryTrayUiSortPosition(
  entry: Pick<StoryTrayEntry, "ranked_position" | "seen_ranked_position">,
): number {
  if (entry.seen_ranked_position !== undefined) {
    return entry.seen_ranked_position;
  }

  if (entry.ranked_position !== undefined) {
    return entry.ranked_position;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function parseStoriesTrayReport(
  report: StoriesReport | StoriesManifestReport,
): ParsedStoryTrayUser[] {
  if (isStoriesManifestReport(report)) {
    return report.manifest.users.map((entry) => ({
      items: [
        {
          media_ids: entry.media_ids,
        },
      ],
      username: entry.username,
    }));
  }

  const tray = report.xdt_api__v1__feed__reels_tray.tray;
  const groupedTray: ParsedStoryTrayUser[] = [];
  const groupByUsername = new Map<string, ParsedStoryTrayUser>();

  [...tray]
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .toSorted((left, right) => {
      const positionDelta =
        getStoryTrayUiSortPosition(left.entry) - getStoryTrayUiSortPosition(right.entry);

      if (positionDelta !== 0) {
        return positionDelta;
      }

      return left.originalIndex - right.originalIndex;
    })
    .forEach(({ entry }) => {
      const username = entry.user.username;
      let group = groupByUsername.get(username);

      if (!group) {
        group = {
          items: [],
          username,
        };
        groupByUsername.set(username, group);
        groupedTray.push(group);
      }

      group.items.push({
        media_ids: entry.media_ids,
      });
    });

  return groupedTray;
}

export function parseStoryReport(report: StoriesMediaReport, pk: string): ParsedStory {
  const item = findStoryItem(report, pk);
  return parseStoryItem(item);
}

function parseStoryItem(item: StoryItem): ParsedStory {
  const mediaType = getStoryMediaType(item.media_type);

  if (mediaType === STORY_MEDIA_TYPES.IMAGE) {
    const candidate = getLargestVersion(item.image_versions2?.candidates);

    return {
      height: candidate?.height ?? item.original_height ?? null,
      media_type: mediaType,
      pk: item.pk,
      story_bloks_stickers: item.story_bloks_stickers ?? null,
      story_music_stickers: item.story_music_stickers ?? null,
      url: candidate?.url ?? null,
      width: candidate?.width ?? item.original_width ?? null,
    };
  }

  const largestVideo = getLargestVersion(item.video_versions);
  const selectedVideo = largestVideo ?? item.video_versions?.[0] ?? null;

  return {
    height: selectedVideo?.height ?? item.original_height ?? null,
    media_type: mediaType,
    pk: item.pk,
    story_bloks_stickers: item.story_bloks_stickers ?? null,
    story_music_stickers: item.story_music_stickers ?? null,
    url: selectedVideo?.url ?? null,
    width: selectedVideo?.width ?? item.original_width ?? null,
  };
}

export async function parseStoryManifestReport(
  report: StoriesManifestReport,
  pk: string,
  repository: Pick<StoryRepository, "findByMediaPk">,
): Promise<ParsedStory> {
  const manifestItem = report.manifest.users
    .flatMap((user) => user.stories)
    .find((story) => story.media_pk === pk);

  if (!manifestItem) {
    throw new Error(`Story with pk ${pk} not found`);
  }

  if (manifestItem.status === "failed") {
    throw new Error(`Story with pk ${pk} was not fetched successfully`);
  }

  const item = await repository.findByMediaPk(manifestItem.media_pk);
  if (item === null) throw new Error(`Story item ${manifestItem.media_pk} not found`);
  return parseStoryItem(item);
}
