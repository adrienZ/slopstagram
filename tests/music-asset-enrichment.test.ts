import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "vitest";
import sharp from "sharp";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import { cacheReportAudio } from "../sdk/report-audio-service.ts";
import { cacheReceivedAudio } from "../sdk/music-media-service.ts";
import { enrichCurrentMusicAssets } from "../sdk/music-asset-enrichment.ts";
import { JsonValueSchema } from "../sdk/lib/json-value.ts";
import { createMediaResponse } from "../server/routes/media/[...path].ts";
import { startMediaServer } from "./media-server.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  noSleep,
  reel,
  response,
} from "./mock-helpers.ts";

test("ingestion looks up one shared audio ID and caches validated audio and artwork", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const directory = await mkdtemp(path.join(tmpdir(), "music-lookup-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(directory, { recursive: true, force: true });
  });
  const audio = await readFile(new globalThis.URL("fixtures/audio-clip.m4a", import.meta.url));
  const cover = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const audioId = "1088211046447259";
  const server = await startMediaServer(context, (request, result) => {
    if (request.url === `/lookup/${audioId}`) {
      result.writeHead(200, { "content-type": "application/json" });
      result.end(
        JSON.stringify({
          metadata: {
            music_info: {
              music_asset_info: {
                audio_asset_id: audioId,
                title: "Song",
                display_artist: "Artist",
                progressive_download_url: "https://example.com/audio.m4a",
                cover_artwork_uri: "https://example.com/cover.png",
              },
            },
          },
        }),
      );
    } else if (request.url === "/audio.m4a") {
      result.writeHead(200, { "content-type": "video/mp4" });
      result.end(audio);
    } else {
      result.writeHead(200, { "content-type": "image/png" });
      result.end(cover);
    }
  });
  const stories = ["first", "second"].map((pk) => ({
    pk,
    media_type: 1,
    taken_at: 1_790_000_000,
    image_versions2: { candidates: [{ url: `https://example.com/${pk}.jpg` }] },
    story_music_stickers: [
      { id: `sticker-${pk}`, music_asset_info: { audio_asset_id: audioId, title: "Original" } },
    ],
  }));
  const client = createClient(
    [
      {
        id: "reel",
        media_ids: stories.map(({ pk }) => pk),
        user: { username: "one", pk: "owner" },
      },
    ],
    [
      response({
        reels: { reel: { ...reel("reel", stories), user: { username: "one", pk: "owner" } } },
      }),
    ],
  );
  client.getMusicAsset = async (id) => {
    const result = await server.fetchMedia(`https://example.com/lookup/${id}`);
    const body = JsonValueSchema.parse(await result.json());
    return { ok: result.ok, status: result.status, headers: {}, json: () => body };
  };
  const repository = new StoryRepository(database);
  const report = await fetchStoriesManifest(client, {
    storyRepository: repository,
    storyStorage: createMemoryStorage(),
    logger: createCapturingLogger(),
    now: fixedNow,
    sleep: noSleep,
  });
  assert.deepEqual(server.requests, [`/lookup/${audioId}`]);
  const before = repository.findByMediaPk("first")?.annotations;
  assert.ok(before);
  assert.deepEqual(
    before.stickers.map(({ label }) => label),
    ["Original"],
  );
  assert.equal(before.musicObservations?.[0].metadata.status, "usable");
  assert.notEqual(before.musicObservations[0].occurrenceId, null);
  await cacheReportAudio(report, { database, directory, fetchMedia: server.fetchMedia });
  const first = repository.findByMediaPk("first")?.annotations?.musicObservations?.[0].metadata;
  const second = repository.findByMediaPk("second")?.annotations?.musicObservations?.[0].metadata;
  assert.ok(first);
  assert.equal(first.id, second?.id);
  assert.equal(first.audioState, "available");
  assert.equal(first.artworkState, "available");
  assert.equal(first.audioDurationMs, 1023);
  assert.ok(first.audioCachePath !== null);
  assert.ok(first.artworkCachePath !== null);
  assert.deepEqual(await readFile(path.join(directory, first.audioCachePath)), audio);
  const artwork = await createMediaResponse(first.artworkCachePath, directory);
  assert.equal(artwork.status, 200);
  assert.equal(artwork.headers.get("content-type"), "image/jpeg");
  await cacheReportAudio(report, { database, directory, fetchMedia: server.fetchMedia });
  assert.deepEqual(server.requests, [`/lookup/${audioId}`, "/audio.m4a", "/cover.png"]);
});

test("lookup rejects mismatched and original-sound results and stops on rate limiting", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const stories = ["mismatch", "original", "limited", "after"].map((pk) => ({
    pk,
    story_music_stickers: [{ music_asset_info: { audio_asset_id: pk, title: pk } }],
  }));
  for (const story of stories) {
    // oxlint-disable-next-line no-await-in-loop -- Persist independent stories in order.
    await repository.save(story);
  }
  const server = await startMediaServer(context, (request, result) => {
    if (request.url === "/limited") {
      result.writeHead(429);
      result.end();
      return;
    }
    result.writeHead(200, { "content-type": "application/json" });
    result.end(
      JSON.stringify(
        request.url === "/original"
          ? {
              metadata: {
                original_sound_info: {
                  audio_asset_id: "original",
                  progressive_download_url: "https://example.com/audio",
                },
              },
            }
          : {
              metadata: {
                music_info: {
                  music_asset_info: {
                    audio_asset_id: "different",
                    progressive_download_url: "https://example.com/audio",
                  },
                },
              },
            },
      ),
    );
  });
  const logger = createCapturingLogger();
  await enrichCurrentMusicAssets(
    {
      getMusicAsset: async (id) => {
        const result = await server.fetchMedia(`https://example.com/${id}`);
        const body = result.ok ? JsonValueSchema.parse(await result.json()) : null;
        return { ok: result.ok, status: result.status, headers: {}, json: () => body };
      },
    },
    stories,
    repository,
    logger,
  );
  assert.deepEqual(server.requests, ["/mismatch", "/original", "/limited"]);
  for (const story of stories) {
    assert.equal(
      repository.findByMediaPk(story.pk)?.annotations?.musicObservations?.[0].metadata
        .audioSourceUrl,
      null,
    );
  }
  assert.ok(logger.messages.some((message) => message.includes("429")));
});

test("generic video/mp4 responses with a video track are never cached as music", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const directory = await mkdtemp(path.join(tmpdir(), "music-video-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(directory, { recursive: true, force: true });
  });
  const video = await readFile(new globalThis.URL("fixtures/video-clip.mp4", import.meta.url));
  const server = await startMediaServer(context, (_request, result) => {
    result.writeHead(200, { "content-type": "video/mp4" });
    result.end(video);
  });
  const cached = await cacheReceivedAudio("asset", "https://example.com/video", null, {
    database,
    directory,
    fetchMedia: server.fetchMedia,
  });
  assert.equal(cached.state, "unsupported");
  assert.equal(cached.cachePath, null);
});

test("lookup skips stories without an audio ID, muted stories, and shared reels", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const stories = [
    { pk: "missing", story_music_stickers: [{ music_asset_info: { title: "Song" } }] },
    {
      pk: "muted",
      story_music_stickers: [
        { music_asset_info: { audio_asset_id: "muted", title: "Song", should_mute_audio: true } },
      ],
    },
    {
      pk: "silent",
      has_audio: false,
      story_music_stickers: [{ music_asset_info: { audio_asset_id: "silent", title: "Song" } }],
    },
    {
      pk: "reel",
      story_feed_media: [{ product_type: "clips" }],
      story_music_stickers: [{ music_asset_info: { audio_asset_id: "reel", title: "Song" } }],
    },
  ];
  for (const story of stories) {
    // oxlint-disable-next-line no-await-in-loop -- Persist independent stories in order.
    await repository.save(story);
  }
  const server = await startMediaServer(context, (_request, result) => {
    result.writeHead(200, { "content-type": "application/json" });
    result.end("{}");
  });
  await enrichCurrentMusicAssets(
    {
      getMusicAsset: async (id) => {
        const result = await server.fetchMedia(`https://example.com/${id}`);
        const body = JsonValueSchema.parse(await result.json());
        return { ok: result.ok, status: result.status, headers: {}, json: () => body };
      },
    },
    stories,
    repository,
    createCapturingLogger(),
  );
  assert.deepEqual(server.requests, []);
});
