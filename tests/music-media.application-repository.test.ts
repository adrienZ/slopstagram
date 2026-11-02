import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assert, expect, test } from "vitest";
import { useDrizzle } from "@@/core/database/client.ts";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import { storyRepository } from "@@/core/database/repositories/story-repository.ts";
import { processMusicArtwork, processMusicMedia } from "@@/core/music/music-media.ts";
import { startMediaServer, wavAudio } from "./media-server.ts";

// Without a story repository option, music media caching reads and writes the application's.
test("music media caching defaults to the application's story repository", async (context) => {
  migrateDatabase(useDrizzle());
  const root = await mkdtemp(path.join(tmpdir(), "music-media-default-"));
  context.onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
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
  const media = await startMediaServer(context, (request, response) => {
    if (request.url === "/default-audio") {
      response.writeHead(200, { "content-type": "audio/wav" });
      response.end(wavAudio());
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const reference = { id: metadata.id, status: metadata.status };

  const artwork = await processMusicArtwork(reference, {
    directory: root,
    fetchMedia: media.fetchMedia,
  });
  const audio = await processMusicMedia(reference, {
    directory: root,
    fetchMedia: media.fetchMedia,
  });

  expect(artwork?.artworkState).toBe("failed");
  expect(audio?.audioState).toBe("available");
  expect(storyRepository.findMusicMetadata(reference)?.audioState).toBe("available");
});
