import { assert, describe, expect, test } from "vitest";
import { createStoryFixtures } from "./test-database.ts";

const STICKER_ASSET = {
  title: "Song",
  display_artist: "Artist",
  audio_asset_id: "audio",
  progressive_download_url: "https://example.com/audio",
  cover_artwork_uri: "https://example.com/cover",
};

async function saveMusicStory(context: Parameters<typeof createStoryFixtures>[0]) {
  const { storyRepository } = createStoryFixtures(context);
  await storyRepository.save({
    pk: "story",
    story_music_stickers: [{ id: "sticker", music_asset_info: STICKER_ASSET }],
  });
  const metadata = storyRepository.listMusicObservations("story").at(0)?.metadata;
  assert.ok(metadata);
  return { metadata, storyRepository };
}

describe("StoryRepository music media", () => {
  test("lists the music observations of a story in sticker order, and none for an unknown story", async (context) => {
    const { metadata, storyRepository } = await saveMusicStory(context);

    const observations = storyRepository.listMusicObservations("story");
    expect(observations).toHaveLength(1);
    expect(observations[0].metadata).toStrictEqual(metadata);
    expect(observations[0].metadata.title).toBe("Song");
    expect(storyRepository.listMusicObservations("unknown")).toStrictEqual([]);
  });

  test("finds music metadata for a reference, and nothing for an unknown reference", async (context) => {
    const { metadata, storyRepository } = await saveMusicStory(context);

    expect(storyRepository.findMusicMetadata(metadata)).toMatchObject({
      id: metadata.id,
      instagramAudioAssetId: "audio",
      audioState: "pending",
    });
    expect(storyRepository.findMusicMetadata({ id: "unknown", status: "usable" })).toBeUndefined();
  });

  test("saves music media only when the source still matches", async (context) => {
    const { metadata, storyRepository } = await saveMusicStory(context);

    storyRepository.saveMusicMedia(
      metadata,
      "audio",
      "https://example.com/other",
      "audio/stale.mp3",
      "available",
      1000,
    );
    expect(storyRepository.findMusicMetadata(metadata)).toMatchObject({
      audioCachePath: null,
      audioState: "pending",
    });

    storyRepository.saveMusicMedia(
      metadata,
      "audio",
      "https://example.com/audio",
      "audio/file.mp3",
      "available",
      1000,
    );
    storyRepository.saveMusicMedia(
      metadata,
      "artwork",
      "https://example.com/cover",
      "music/cover.jpg",
      "available",
    );
    expect(storyRepository.findMusicMetadata(metadata)).toMatchObject({
      audioCachePath: "audio/file.mp3",
      audioState: "available",
      audioDurationMs: 1000,
      artworkCachePath: "music/cover.jpg",
      artworkState: "available",
    });
  });

  test("defaults the audio duration to none and matches a missing source", async (context) => {
    const { storyRepository } = createStoryFixtures(context);
    await storyRepository.save({
      pk: "story",
      story_music_stickers: [
        { id: "sticker", music_asset_info: { title: "Song", display_artist: "Artist" } },
      ],
    });
    const metadata = storyRepository.listMusicObservations("story").at(0)?.metadata;
    assert.ok(metadata);

    storyRepository.saveMusicMedia(metadata, "audio", null, null, "unavailable");
    expect(storyRepository.findMusicMetadata(metadata)).toMatchObject({
      audioDurationMs: null,
      audioState: "unavailable",
    });
  });
});
