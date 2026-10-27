import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { processMusicMedia } from "../sdk/music-media-service.ts";
import { startMediaServer, wavAudio } from "./media-server.ts";

test("music processing publishes audio only and reuses it without provider requests", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const root = await mkdtemp(path.join(tmpdir(), "music-media-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(root, { recursive: true, force: true });
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "story",
    story_music_stickers: [
      {
        id: "sticker",
        music_asset_info: {
          title: "Song",
          display_artist: "Artist",
          audio_asset_id: "audio",
          progressive_download_url: "https://example.com/audio",
          cover_artwork_uri: "https://example.com/cover",
        },
      },
    ],
  });
  const before = repository.findByMediaPk("story")?.annotations;
  const metadata = before?.musicObservations?.[0].metadata;
  assert.ok(metadata);
  const media = await startMediaServer(context, (_request, response) => {
    response.writeHead(200, { "content-type": "audio/wav" });
    response.end(wavAudio());
  });
  const result = await processMusicMedia(
    { id: metadata.id, status: metadata.status },
    {
      database,
      directory: root,
      fetchMedia: media.fetchMedia,
    },
  );
  assert.equal(result?.audioState, "available");
  assert.equal(result.artworkState, "pending");
  assert.ok(result.audioCachePath !== null);
  assert.deepEqual(await readFile(path.join(root, result.audioCachePath)), wavAudio());
  assert.equal(result.audioDurationMs, 1000);
  const retry = await processMusicMedia(
    { id: metadata.id, status: metadata.status },
    {
      database,
      directory: root,
      fetchMedia: media.fetchMedia,
    },
  );
  assert.equal(retry?.audioCachePath, result.audioCachePath);
  assert.deepEqual(media.requests, ["/audio"]);
  const cold = new StoryRepository(database).findByMediaPk("story")?.annotations;
  assert.deepEqual(cold?.stickers, before.stickers);
  assert.equal(cold.musicObservations?.[0].metadata.audioState, "available");
});

test("partial audio stays separate and promotion preserves its source and processing state", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const root = await mkdtemp(path.join(tmpdir(), "music-partial-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(root, { recursive: true, force: true });
  });
  const repository = new StoryRepository(database);
  const asset = {
    title: "Same",
    fast_start_progressive_download_url: "https://example.com/fallback",
    cover_artwork_thumbnail_uri: "https://example.com/art",
  };
  await repository.save({
    pk: "story",
    story_music_stickers: [
      { id: "a", music_asset_info: asset },
      { id: "b", music_asset_info: asset },
    ],
  });
  const observations = repository.findByMediaPk("story")?.annotations?.musicObservations;
  assert.ok(observations);
  assert.notEqual(observations[0].metadata.id, observations[1].metadata.id);
  const reference = observations[0].metadata;
  let status = 200;
  let contentType = "text/html";
  const media = await startMediaServer(context, (_request, response) => {
    response.writeHead(status, { "content-type": contentType });
    response.end(contentType === "audio/wav" ? wavAudio() : "not audio");
  });
  const result = await processMusicMedia(reference, {
    database,
    directory: root,
    fetchMedia: media.fetchMedia,
  });
  assert.ok(result);
  assert.equal(result.audioState, "unsupported");
  assert.equal(result.audioCachePath, null);
  assert.equal(result.artworkState, "pending");
  assert.equal(result.artworkCachePath, null);
  assert.equal(
    repository.findByMediaPk("story")?.annotations?.musicObservations?.[0].metadata.status,
    "partial",
  );
  await repository.save({
    pk: "story",
    story_music_stickers: [
      { id: "a", music_asset_info: { audio_asset_id: "audio", display_artist: "Artist" } },
    ],
  });
  const promoted = repository.findByMediaPk("story")?.annotations?.musicObservations?.[0].metadata;
  assert.ok(promoted);
  assert.equal(promoted.status, "usable");
  assert.equal(promoted.artworkCachePath, result.artworkCachePath);
  assert.equal(promoted.audioState, "unsupported");
  contentType = "audio/wav";
  const recovered = await processMusicMedia(promoted, {
    database,
    directory: root,
    fetchMedia: media.fetchMedia,
  });
  assert.ok(recovered);
  assert.notEqual(recovered.audioCachePath, null);
  assert.ok(recovered.audioCachePath !== null);
  await rm(path.join(root, recovered.audioCachePath));
  status = 403;
  const missing = await processMusicMedia(promoted, {
    database,
    directory: root,
    fetchMedia: media.fetchMedia,
  });
  assert.equal(missing?.audioState, "failed");
  assert.equal(missing.audioCachePath, null);
  assert.equal(missing.artworkCachePath, result.artworkCachePath);
});

test("missing sources do not fetch and failed transfers never publish partial files", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const root = await mkdtemp(path.join(tmpdir(), "music-transfer-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(root, { recursive: true, force: true });
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "story",
    story_music_stickers: [{ id: "a", music_asset_info: { title: "Song" } }],
  });
  const metadata = repository.findByMediaPk("story")?.annotations?.musicObservations?.[0].metadata;
  assert.ok(metadata);
  const media = await startMediaServer(context, (_request, response) => {
    response.writeHead(200, { "content-type": "audio/mpeg", "content-length": 1000 });
    response.flushHeaders();
    response.write(new Uint8Array([1, 2]));
    response.destroy();
  });
  const empty = await processMusicMedia(metadata, {
    database,
    directory: root,
    fetchMedia: media.fetchMedia,
  });
  assert.equal(empty?.audioState, "unavailable");
  assert.equal(empty.artworkState, "unavailable");
  assert.deepEqual(media.requests, []);
  await repository.save({
    pk: "story",
    story_music_stickers: [
      { id: "a", music_asset_info: { progressive_download_url: "https://example.com/audio" } },
    ],
  });
  const failed = await processMusicMedia(metadata, {
    database,
    directory: root,
    fetchMedia: media.fetchMedia,
  });
  assert.equal(failed?.audioState, "failed");
  assert.equal(failed.audioCachePath, null);
  const { readdir } = await import("node:fs/promises");
  assert.deepEqual(await readdir(root), []);
});

test("the cached file duration survives partial promotion and remains distinct from the full song duration", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const root = await mkdtemp(path.join(tmpdir(), "music-duration-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(root, { recursive: true, force: true });
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "clip",
    story_music_stickers: [
      {
        id: "occurrence",
        music_asset_info: {
          title: "Song",
          progressive_download_url: "https://example.com/clip.wav",
          duration_in_ms: 999_999,
        },
      },
    ],
  });
  const metadata = repository.findByMediaPk("clip")?.annotations?.musicObservations?.[0].metadata;
  assert.ok(metadata);
  const wav = wavAudio();
  const media = await startMediaServer(context, (_request, response) => {
    response.writeHead(200, { "content-type": "audio/wav" });
    response.end(wav);
  });
  const result = await processMusicMedia(metadata, {
    database,
    directory: root,
    fetchMedia: media.fetchMedia,
  });
  assert.equal(result?.audioDurationMs, 1000);
  assert.equal(result.durationMs, 999_999);
  await repository.save({
    pk: "clip",
    story_music_stickers: [
      { id: "occurrence", music_asset_info: { audio_asset_id: "asset", display_artist: "Artist" } },
    ],
  });
  const promoted = new StoryRepository(database).findByMediaPk("clip")?.annotations
    ?.musicObservations?.[0].metadata;
  assert.equal(promoted?.status, "usable");
  assert.equal(promoted.audioDurationMs, 1000);
  assert.equal(promoted.durationMs, 999_999);
  assert.equal(
    database.$client.prepare("SELECT count(*) n FROM metadata_music_partial").get()?.n,
    0,
  );
});
