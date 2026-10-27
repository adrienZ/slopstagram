import { StoryMusicObservationSchema } from "../sdk/entities/music-metadata.ts";
import { expect, test } from "vitest";
import { musicStickerItems } from "../server/music-preview.ts";
import type { StoryAnnotations } from "../sdk/lib/types.ts";

function legacyStory(): StoryAnnotations {
  return {
    locations: [],
    stickers: [{ kind: "music", label: "bliss - iogi", occurrenceId: "legacy", source: "unknown" }],
    musicObservations: [
      {
        id: "cache-observation",
        source: "story_music_stickers",
        occurrenceId: null,
        providerOccurrenceId: "4001994273439519",
        metadata: {
          status: "usable",
          id: "music",
          instagramAudioAssetId: "852933505253613",
          title: "bliss",
          artist: "iogi",
          durationMs: 10_000,
          audioDurationMs: null,
          audioSourceUrl: null,
          artworkSourceUrl: null,
          audioCachePath: `audio/${"a".repeat(64)}.m4a`,
          artworkCachePath: null,
          audioState: "available",
          artworkState: "unavailable",
        },
      },
    ],
  };
}

test("legacy music renders once when its exact title and artist identify one observation in the same story", () => {
  const items = musicStickerItems(legacyStory());
  expect(items).toHaveLength(1);
  expect(items[0].label).toBe("bliss - iogi");
  expect(items[0].preview?.audioUrl).toBe(`/media/audio/${"a".repeat(64)}.m4a`);
});

test("matching legacy labels preserve real repeated occurrences without adding an unlinked third row", () => {
  const story = legacyStory();
  story.stickers.push({ ...story.stickers[0], occurrenceId: "second" });
  const items = musicStickerItems(story);
  expect(items).toHaveLength(2);
  expect(
    items.every((item) => item.preview?.audioUrl === `/media/audio/${"a".repeat(64)}.m4a`),
  ).toBe(true);
});

test("two different assets with identical labels remain ambiguous", () => {
  const story = legacyStory();
  const [first] = story.musicObservations ?? [];
  expect(first).toBeDefined();
  story.musicObservations?.push({
    ...first,
    id: "other",
    metadata: {
      ...first.metadata,
      id: "other-asset",
      instagramAudioAssetId: "different",
      audioCachePath: `audio/${"b".repeat(64)}.m4a`,
    },
  });
  expect(musicStickerItems(story)[0].preview).toBeNull();
});

test("legacy cached annotations without playback duration remain readable", () => {
  const [observation] = legacyStory().musicObservations ?? [];
  const { audioDurationMs, ...metadata } = observation.metadata;
  expect(audioDurationMs).toBeNull();
  expect(
    StoryMusicObservationSchema.parse({ ...observation, metadata }).metadata.audioDurationMs,
  ).toBeNull();
});
