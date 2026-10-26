import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { processMusicMedia } from "../sdk/music-media-service.ts";

test("music processing publishes independent local copies and reuses them without provider requests", async (context) => {
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
  const result = await processMusicMedia(
    { id: metadata.id, status: metadata.status },
    {
      database,
      directory: root,
      fetchMedia: async (url) =>
        new globalThis.Response(url.includes("cover") ? "broken" : "audio-bytes", {
          status: url.includes("cover") ? 403 : 200,
          headers: { "content-type": "audio/mp4" },
        }),
    },
  );
  assert.equal(result?.audioState, "available");
  assert.equal(result.artworkState, "failed");
  assert.ok(result.audioCachePath !== null);
  assert.equal(await readFile(path.join(root, result.audioCachePath), "utf-8"), "audio-bytes");
  const retry = await processMusicMedia(
    { id: metadata.id, status: metadata.status },
    {
      database,
      directory: root,
      fetchMedia: async (url) => {
        assert.ok(url.includes("cover"), "cached audio must not refetch");
        return new globalThis.Response("bad", { status: 404 });
      },
    },
  );
  assert.equal(retry?.audioCachePath, result.audioCachePath);
  const cold = new StoryRepository(database).findByMediaPk("story")?.annotations;
  assert.deepEqual(cold?.stickers, before.stickers);
  assert.equal(cold.musicObservations?.[0].metadata.audioState, "available");
});

test("partial media stays separate, artwork works without supported audio, and promotion preserves local copies", async (context) => {
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
  const { default: sharp } = await import("sharp");
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const result = await processMusicMedia(reference, {
    database,
    directory: root,
    fetchMedia: async (url) =>
      new globalThis.Response(url.endsWith("art") ? png : "html", {
        headers: { "content-type": url.endsWith("art") ? "image/png" : "text/html" },
      }),
  });
  assert.ok(result);
  assert.equal(result.audioState, "unsupported");
  assert.equal(result.audioCachePath, null);
  assert.equal(result.artworkState, "available");
  assert.notEqual(result.artworkCachePath, null);
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
  const recovered = await processMusicMedia(promoted, {
    database,
    directory: root,
    fetchMedia: async () =>
      new globalThis.Response("audio", { headers: { "content-type": "audio/ogg" } }),
  });
  assert.ok(recovered);
  assert.notEqual(recovered.audioCachePath, null);
  assert.ok(recovered.audioCachePath !== null);
  await rm(path.join(root, recovered.audioCachePath));
  const missing = await processMusicMedia(promoted, {
    database,
    directory: root,
    fetchMedia: async () => new globalThis.Response("gone", { status: 403 }),
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
  const empty = await processMusicMedia(metadata, {
    database,
    directory: root,
    fetchMedia: async () => {
      throw new Error("must not fetch");
    },
  });
  assert.equal(empty?.audioState, "unavailable");
  assert.equal(empty.artworkState, "unavailable");
  await repository.save({
    pk: "story",
    story_music_stickers: [
      { id: "a", music_asset_info: { progressive_download_url: "https://example.com/audio" } },
    ],
  });
  const failed = await processMusicMedia(metadata, {
    database,
    directory: root,
    fetchMedia: async () =>
      new globalThis.Response(
        new globalThis.ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.error(new Error("transfer interrupted"));
          },
        }),
        { headers: { "content-type": "audio/mpeg" } },
      ),
  });
  assert.equal(failed?.audioState, "failed");
  assert.equal(failed.audioCachePath, null);
  const { readdir } = await import("node:fs/promises");
  assert.deepEqual(await readdir(root), []);
});
