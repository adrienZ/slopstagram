import sharp from "sharp";
import { assert, expect, test } from "vitest";
import { useDrizzle } from "@@/core/database/client.ts";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import { storyRepository } from "@@/core/database/repositories/story-repository.ts";
import { processMusicArtwork, processMusicMedia } from "@@/core/music/music-media.ts";
import { startMediaServer, wavAudio } from "./media-server.ts";
import { createMemoryCacheStorage } from "./memory-storage.ts";

// Without a story repository option, music media caching reads and writes the application's.
test("music media caching defaults to the application's story repository", async (context) => {
  migrateDatabase(useDrizzle());
  await storyRepository.save({
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
    storyRepository.findByMediaPk("default-story")?.annotations?.musicObservations?.[0].metadata;
  assert.ok(metadata);
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
  const reference = { id: metadata.id, status: metadata.status };

  const storage = createMemoryCacheStorage();
  const artwork = await processMusicArtwork(
    {
      stories: storyRepository,
      fetchMedia: media.fetchMedia,
      storage,
    },
    reference,
  );
  const audio = await processMusicMedia(
    {
      stories: storyRepository,
      fetchMedia: media.fetchMedia,
      storage,
    },
    reference,
  );

  expect(artwork?.artworkState).toBe("available");
  expect(await storage.images.getKeys()).toHaveLength(1);
  expect(audio?.audioState).toBe("available");
  expect(storyRepository.findMusicMetadata(reference)?.audioState).toBe("available");
});
