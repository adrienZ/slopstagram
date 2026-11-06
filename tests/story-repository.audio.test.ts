import { assert, describe, expect, test } from "vitest";
import { createStoryFixtures } from "@@/tests/test-database.ts";

function manifest(sourceUrl: string) {
  return `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
      <AdaptationSet contentType="audio"><Representation mimeType="audio/mp4" codecs="mp4a.40.5" bandwidth="58686">
        <BaseURL>${sourceUrl}</BaseURL>
        <SegmentBase indexRange="824-975"><Initialization range="0-823"/></SegmentBase>
      </Representation></AdaptationSet>
    </Period>
  </MPD>`;
}

async function saveAudioStory(context: Parameters<typeof createStoryFixtures>[0]) {
  const { storyRepository } = createStoryFixtures(context);
  await storyRepository.save({
    pk: "story",
    video_dash_manifest: manifest("https://example.com/a.mp4"),
    story_music_stickers: [
      { id: "sticker", music_asset_info: { title: "Song", display_artist: "Artist" } },
    ],
  });
  const current = storyRepository.findStoryAudio("story");
  assert.ok(current);
  return { current, storyRepository };
}

describe("StoryRepository story audio", () => {
  test("finds the story audio of a story, and nothing for a story without audio", async (context) => {
    const { current, storyRepository } = await saveAudioStory(context);

    expect(current).toMatchObject({
      mediaPk: "story",
      sourceUrl: "https://example.com/a.mp4",
      cachePath: null,
      state: "pending",
    });
    expect(storyRepository.findStoryAudio("unknown")).toBeUndefined();
  });

  test("saves story audio media only while the source still matches", async (context) => {
    const { current, storyRepository } = await saveAudioStory(context);

    storyRepository.saveStoryAudioMedia(
      { ...current, sourceUrl: "https://example.com/other.mp4" },
      "audio/stale.mp4",
      "available",
      1000,
    );
    expect(storyRepository.findStoryAudio("story")).toMatchObject({
      cachePath: null,
      state: "pending",
    });

    storyRepository.saveStoryAudioMedia(current, "audio/file.mp4", "available", 1000);
    expect(storyRepository.findStoryAudio("story")).toMatchObject({
      cachePath: "audio/file.mp4",
      state: "available",
      durationMs: 1000,
    });
  });

  test("defaults the duration to none", async (context) => {
    const { current, storyRepository } = await saveAudioStory(context);

    storyRepository.saveStoryAudioMedia(current, null, "unavailable");
    expect(storyRepository.findStoryAudio("story")).toMatchObject({
      cachePath: null,
      durationMs: null,
      state: "unavailable",
    });
  });
});
