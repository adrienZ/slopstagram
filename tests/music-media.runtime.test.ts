import sharp from "sharp";
import { assert, expect, test } from "vitest";
import { processMusicArtwork, processMusicMedia } from "@@/core/domains/music/music-media.ts";
import { startMediaServer, wavAudio } from "@@/tests/media-server.ts";
import { createTestRuntime } from "@@/tests/setup/test-runtime.ts";

test("music media caching reads and writes the runtime stories and stores", async (context) => {
  const image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#808080" },
  })
    .png()
    .toBuffer();
  const media = await startMediaServer(context, (request, response) => {
    if (request.url === "/default-audio") {
      response.writeHead(200, { "content-type": "audio/wav" });
      response.end(wavAudio());
      return;
    }
    response.writeHead(200, { "content-type": "image/png" });
    response.end(image);
  });
  const runtime = await createTestRuntime(context, { fetchMedia: media.fetchMedia });
  await runtime.stories.save({
    pk: "default-story",
    story_music_stickers: [
      {
        id: "default-sticker",
        music_asset_info: {
          title: "Default song",
          display_artist: "Default artist",
          audio_asset_id: "default-audio",
          progressive_download_url: "https://example.com/default-audio",
          cover_artwork_uri: "https://example.com/default-cover",
        },
      },
    ],
  });
  const metadata =
    runtime.stories.findByMediaPk("default-story")?.annotations?.musicObservations?.[0].metadata;
  assert.ok(metadata);
  const reference = { id: metadata.id, status: metadata.status };

  const artwork = await processMusicArtwork(runtime, reference);
  const audio = await processMusicMedia(runtime, reference);

  expect(artwork?.artworkState).toBe("available");
  expect(await runtime.storage.images.getKeys()).toHaveLength(1);
  expect(audio?.audioState).toBe("available");
  expect(runtime.stories.findMusicMetadata(reference)?.audioState).toBe("available");
});
