import assert from "node:assert/strict";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import type { StoryItem } from "../sdk/lib/types.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import { createCapturingLogger, createClient, fixedNow, reel, response } from "./mock-helpers.ts";

function present<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined);
  return value;
}

function setup(context: { onTestFinished: (callback: () => void) => void }) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  return { database, repository: new StoryRepository(database) };
}

function read(repository: StoryRepository, pk: string) {
  return present(present(repository.findByMediaPk(pk)).annotations);
}

test("live ingestion shares exact audio identities across occurrences in cold account history", async (context) => {
  const { database, repository } = setup(context);
  const owner = { id: "u1", pk: "u1", username: "one", full_name: "One" };
  await new InstagramUserRepository(database).save(owner);
  const asset = {
    audio_asset_id: "00012345678901234567890",
    title: "  Same Song  ",
    display_artist: "Artist",
    duration_in_ms: 246_652,
  };
  const items: Array<StoryItem> = [
    {
      pk: "m1",
      taken_at: 1_767_225_600,
      story_music_stickers: [
        { id: "a", music_asset_info: asset },
        { id: "b", music_asset_info: asset },
      ],
    },
    {
      pk: "m2",
      taken_at: 1_767_225_601,
      story_music_stickers: [{ id: "c", music_asset_info: { ...asset, duration_in_ms: 0 } }],
    },
    {
      pk: "m3",
      taken_at: 1_767_225_602,
      story_music_stickers: [
        { id: "d", music_asset_info: { ...asset, audio_asset_id: "different" } },
      ],
    },
  ];
  const report = await fetchStoriesManifest(
    createClient(
      [{ id: "r1", media_ids: items.map(({ pk }) => pk), user: owner }],
      [response({ reels: { r1: { ...reel("r1", items), user: owner } } })],
    ),
    {
      logger: createCapturingLogger(),
      now: fixedNow,
      storyRepository: repository,
      storyStorage: createMemoryStorage<StoryItem>(),
    },
  );
  assert.deepEqual(report.manifest.users[0].stories[0].stickers, [
    "Same Song - Artist",
    "Same Song - Artist",
  ]);
  const history = new StoryRepository(database).listByUsername("one");
  const first = present(present(history.find(({ story }) => story.pk === "m1")).story.annotations);
  const shared = present(present(history.find(({ story }) => story.pk === "m2")).story.annotations);
  const homonym = present(
    present(history.find(({ story }) => story.pk === "m3")).story.annotations,
  );
  const observations = present(first.musicObservations);
  assert.equal(observations.length, 2);
  assert.deepEqual(
    observations.map(({ occurrenceId }) => occurrenceId),
    first.stickers.map(({ occurrenceId }) => occurrenceId),
  );
  assert.notEqual(observations[0].occurrenceId, observations[1].occurrenceId);
  assert.deepEqual(
    observations.map(({ providerOccurrenceId }) => providerOccurrenceId),
    ["a", "b"],
  );
  assert.deepEqual(observations[0].metadata, {
    status: "usable",
    id: observations[0].metadata.id,
    instagramAudioAssetId: asset.audio_asset_id,
    title: "  Same Song  ",
    artist: "Artist",
    durationMs: 246_652,
    audioDurationMs: null,
    audioSourceUrl: null,
    artworkSourceUrl: null,
    audioCachePath: null,
    artworkCachePath: null,
    audioState: "unavailable",
    artworkState: "unavailable",
  });
  assert.deepEqual(observations[0].metadata, observations[1].metadata);
  assert.deepEqual(present(shared.musicObservations)[0].metadata, observations[0].metadata);
  assert.notEqual(present(homonym.musicObservations)[0].metadata.id, observations[0].metadata.id);
  assert.equal(history[0].owner_pk, "u1");
});

test("incomplete music keeps provenance without invented labels and never infers an audio ID", async (context) => {
  const { database } = setup(context);
  const logger = createCapturingLogger();
  const repository = new StoryRepository(database, logger);
  await repository.save({
    pk: "m1",
    story_music_stickers: [
      { id: "sticker-only", music_asset_info: {} },
      {
        id: "missing-title",
        music_asset_info: { audio_asset_id: "known", display_artist: "Artist" },
      },
      {
        id: "missing-artist",
        music_asset_info: { audio_asset_id: "other", title: "Song", duration_in_ms: 0 },
      },
      {
        id: "anonymous-a",
        music_asset_info: { id: "not-an-audio-id", title: "Song", display_artist: "Artist" },
      },
      {
        id: "anonymous-b",
        music_asset_info: { title: "Song", display_artist: "Artist", duration_in_ms: -1 },
      },
    ],
  });
  const stored = read(new StoryRepository(database), "m1");
  assert.deepEqual(
    stored.stickers.map(({ label }) => label),
    ["Song", "Song - Artist", "Song - Artist"],
  );
  const observations = present(stored.musicObservations);
  assert.equal(observations.length, 5);
  assert.equal(new Set(observations.map(({ metadata }) => metadata.id)).size, 5);
  assert.deepEqual(
    observations.map(({ occurrenceId }) => occurrenceId),
    [null, null, ...stored.stickers.map(({ occurrenceId }) => occurrenceId)],
  );
  assert.deepEqual(
    observations.map(({ metadata }) => metadata.instagramAudioAssetId),
    [null, "known", "other", null, null],
  );
  assert.deepEqual(
    observations.map(({ metadata }) => metadata.status),
    ["partial", "partial", "partial", "partial", "partial"],
  );
  assert.deepEqual(
    observations.map(({ metadata }) => metadata.durationMs),
    [null, null, null, null, null],
  );
  assert.equal(observations[0].providerOccurrenceId, "sticker-only");
  assert.equal(observations[0].metadata.title, null);
  assert.equal(observations[0].metadata.artist, null);
  assert.deepEqual(logger.messages, []);
});

test("an outer music sticker ID alone is retained as an anonymous partial observation", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({ pk: "m1", story_music_stickers: [{ id: "outer-only" }] });
  const stored = read(new StoryRepository(database), "m1");
  assert.deepEqual(stored.stickers, []);
  const [observation] = present(stored.musicObservations);
  assert.equal(observation.providerOccurrenceId, "outer-only");
  assert.equal(observation.occurrenceId, null);
  assert.equal(observation.metadata.status, "partial");
  assert.equal(observation.metadata.instagramAudioAssetId, null);
});

test("certain partial music promotes every established link and sparse live updates never demote it", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_music_stickers: [{ id: "a", music_asset_info: { title: "Song" } }],
  });
  await repository.save({
    pk: "m2",
    story_music_stickers: [
      { id: "b", music_asset_info: { audio_asset_id: "audio", display_artist: "Artist" } },
    ],
  });
  const before = read(new StoryRepository(database), "m1");
  const [shared] = present(read(repository, "m2").musicObservations);
  await repository.save({
    pk: "m1",
    story_music_stickers: [{ id: "a", music_asset_info: { audio_asset_id: "audio" } }],
  });
  const promoted = read(new StoryRepository(database), "m1");
  assert.deepEqual(promoted.stickers, before.stickers);
  const [observation] = present(promoted.musicObservations);
  assert.equal(observation.metadata.status, "usable");
  assert.equal(observation.metadata.id, shared.metadata.id);
  assert.equal(observation.metadata.title, "Song");
  assert.equal(observation.metadata.artist, "Artist");
  assert.equal(observation.metadata.durationMs, null);
  assert.equal(observation.occurrenceId, before.stickers[0].occurrenceId);
  assert.deepEqual(
    present(read(new StoryRepository(database), "m2").musicObservations)[0].metadata,
    observation.metadata,
  );
  await repository.save({
    pk: "m2",
    story_music_stickers: [
      {
        id: "b",
        music_asset_info: { audio_asset_id: "audio", title: "Updated", duration_in_ms: 123_456 },
      },
    ],
  });
  await repository.save({
    pk: "m1",
    story_music_stickers: [
      { id: "a", music_asset_info: { title: "", display_artist: " ", duration_in_ms: 0 } },
    ],
  });
  const sparse = read(new StoryRepository(database), "m1");
  assert.deepEqual(sparse.stickers, before.stickers);
  const [{ metadata }] = present(sparse.musicObservations);
  assert.equal(metadata.id, shared.metadata.id);
  assert.equal(metadata.status, "usable");
  assert.equal(metadata.instagramAudioAssetId, "audio");
  assert.equal(metadata.title, "Updated");
  assert.equal(metadata.artist, "Artist");
  assert.equal(metadata.durationMs, 123_456);
  assert.deepEqual(
    present(read(new StoryRepository(database), "m2").musicObservations)[0].metadata,
    metadata,
  );
});

test("music links survive reordered live input and cold resaves, with source clearing kept independent", async (context) => {
  const { database, repository } = setup(context);
  const a = {
    id: "a",
    music_asset_info: { audio_asset_id: "one", title: "Song", display_artist: "Artist" },
  };
  const b = {
    id: "b",
    music_asset_info: { audio_asset_id: "two", title: "Song", display_artist: "Artist" },
  };
  await repository.save({
    pk: "m1",
    story_music_stickers: [a, b],
    story_locations: [{ id: "place", location: { pk: "place", name: "Place", lat: 1, lng: 2 } }],
  });
  const before = read(repository, "m1");
  const byProvider = new Map(
    present(before.musicObservations).map((entry) => [entry.providerOccurrenceId, entry]),
  );
  await repository.save({ pk: "m1", story_music_stickers: [b, a] });
  const reordered = read(new StoryRepository(database), "m1");
  assert.deepEqual(
    present(reordered.musicObservations).map(({ providerOccurrenceId }) => providerOccurrenceId),
    ["b", "a"],
  );
  for (const entry of present(reordered.musicObservations)) {
    assert.deepEqual(entry, byProvider.get(entry.providerOccurrenceId));
  }
  await repository.save(present(new StoryRepository(database).findByMediaPk("m1")));
  assert.deepEqual(read(new StoryRepository(database), "m1"), reordered);
  await repository.save({ pk: "m1", story_music_stickers: [] });
  const cleared = read(new StoryRepository(database), "m1");
  assert.equal(cleared.musicObservations, undefined);
  assert.deepEqual(cleared.locationObservations, before.locationObservations);
  assert.deepEqual(
    cleared.stickers,
    before.stickers.filter(({ kind }) => kind === "location"),
  );
  assert.equal(cleared.sources?.includes("story_music_stickers"), true);
});

test("malformed or omitted music sources preserve rich metadata and all saved contributions", async (context) => {
  const { database, repository } = setup(context);
  const asset = {
    audio_asset_id: "audio",
    title: "Before",
    display_artist: "Artist",
    duration_in_ms: 123_456,
  };
  await repository.save({ pk: "m1", story_music_stickers: [{ id: "a", music_asset_info: asset }] });
  const before = read(repository, "m1");
  for (const story of [
    { pk: "m1" },
    { pk: "m1", story_music_stickers: null },
    { pk: "m1", story_music_stickers: "invalid" },
    {
      pk: "m1",
      story_music_stickers: [{ id: "a", music_asset_info: { ...asset, title: "Corrupt" } }, null],
    },
    { pk: "m1", story_music_stickers: [{ id: "a", music_asset_info: "invalid" }] },
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Persist and cold-read each source contract independently.
    await repository.save(story);
    assert.deepEqual(read(new StoryRepository(database), "m1"), before);
  }
});

test("failed promotion rolls back metadata, links, ownership and media and removes superseded partials only on success", async (context) => {
  const { database, repository } = setup(context);
  const users = new InstagramUserRepository(database);
  const owner = { id: "u1", pk: "u1", username: "one", full_name: "One" };
  const other = { id: "u2", pk: "u2", username: "two", full_name: "Two" };
  await users.save(owner);
  await users.save(other);
  await repository.save(
    {
      pk: "m1",
      taken_at: 1_767_225_600,
      media_type: 1,
      image_versions2: { candidates: [{ url: "https://example.com/old.jpg" }] },
      story_music_stickers: [
        { id: "a", music_asset_info: { audio_asset_id: "audio", title: "Song" } },
      ],
    },
    owner,
  );
  await repository.save({
    pk: "m2",
    story_music_stickers: [{ id: "b", music_asset_info: { audio_asset_id: "audio" } }],
  });
  const before = repository.findByMediaPk("m1");
  const partial = repository.findByMediaPk("m2");
  database.$client
    .exec(`CREATE TEMP TRIGGER reject_partial_removal BEFORE DELETE ON metadata_music_partial
    BEGIN SELECT RAISE(ABORT, 'fixture promotion failure'); END`);
  const promoted: StoryItem = {
    pk: "m1",
    taken_at: 1_767_225_601,
    media_type: 2,
    image_versions2: { candidates: [{ url: "https://example.com/new.jpg" }] },
    story_music_stickers: [
      { id: "a", music_asset_info: { audio_asset_id: "audio", display_artist: "Artist" } },
    ],
  };
  await assert.rejects(repository.save(promoted, other));
  const cold = new StoryRepository(database);
  assert.deepEqual(cold.findByMediaPk("m1"), before);
  assert.deepEqual(cold.findByMediaPk("m2"), partial);
  assert.equal(cold.listByUsername("one").length, 1);
  assert.equal(cold.listByUsername("two").length, 0);
  database.$client.exec("DROP TRIGGER reject_partial_removal");
  await repository.save(promoted, other);
  const [first] = present(read(cold, "m1").musicObservations);
  const [second] = present(read(cold, "m2").musicObservations);
  assert.equal(first.metadata.status, "usable");
  assert.equal(first.metadata.title, "Song");
  assert.equal(first.metadata.artist, "Artist");
  assert.deepEqual(first.metadata, second.metadata);
  assert.equal(first.occurrenceId, before?.annotations?.stickers[0].occurrenceId);
  assert.equal(cold.listByUsername("two").length, 1);
  assert.equal(
    database.$client.prepare("SELECT count(*) n FROM metadata_music_partial").get()?.n,
    0,
  );
  assert.equal(
    database.$client
      .prepare("SELECT count(*) n FROM story_music_observations WHERE partialMusicId IS NOT NULL")
      .get()?.n,
    0,
  );
});

test("changed audio identity cannot inherit the previous recording's missing fields", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_music_stickers: [
      {
        id: "same-sticker",
        music_asset_info: {
          audio_asset_id: "old",
          title: "Old recording",
          display_artist: "Old artist",
          duration_in_ms: 120_000,
        },
      },
    ],
  });
  const [before] = present(read(repository, "m1").musicObservations);
  await repository.save({
    pk: "m1",
    story_music_stickers: [
      { id: "same-sticker", music_asset_info: { audio_asset_id: "new", title: "New recording" } },
    ],
  });
  const [after] = present(read(new StoryRepository(database), "m1").musicObservations);
  assert.equal(after.occurrenceId, before.occurrenceId);
  assert.notEqual(after.metadata.id, before.metadata.id);
  assert.equal(after.metadata.instagramAudioAssetId, "new");
  assert.equal(after.metadata.status, "partial");
  assert.equal(after.metadata.artist, null);
  assert.equal(after.metadata.durationMs, null);
});

test("uncertain repeated music stays separate while current raw occurrences receive their own links", async (context) => {
  const { database, repository } = setup(context);
  const anonymous = { title: "Same", display_artist: "Artist" };
  await repository.save({
    pk: "m1",
    story_music_stickers: [
      { music_asset_info: anonymous },
      { music_asset_info: anonymous },
      {
        id: "duplicate",
        music_asset_info: { audio_asset_id: "one", title: "One", display_artist: "Artist" },
      },
      { id: "duplicate", music_asset_info: { audio_asset_id: "two" } },
    ],
  });
  const before = read(new StoryRepository(database), "m1");
  const observations = present(before.musicObservations);
  assert.equal(before.stickers.length, 3);
  assert.deepEqual(
    observations.map(({ occurrenceId }) => occurrenceId),
    [...before.stickers.map(({ occurrenceId }) => occurrenceId), null],
  );
  assert.notEqual(observations[0].metadata.id, observations[1].metadata.id);
  await repository.save({
    pk: "m1",
    story_music_stickers: [{ music_asset_info: anonymous }, { music_asset_info: anonymous }],
  });
  const after = read(new StoryRepository(database), "m1");
  assert.equal(after.stickers.length, 2);
  for (const entry of present(after.musicObservations)) {
    assert.ok(after.stickers.some(({ occurrenceId }) => occurrenceId === entry.occurrenceId));
    assert.ok(observations.every((old) => old.metadata.id !== entry.metadata.id));
  }
});

test("numeric IDs are accepted only when exact and invalid durations remain unknown", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_music_stickers: [
      {
        id: 42,
        music_asset_info: {
          audio_asset_id: 123,
          title: "Song",
          display_artist: "Artist",
          duration_in_ms: 1000,
        },
      },
      {
        id: "unsafe",
        music_asset_info: {
          audio_asset_id: 9_007_199_254_740_992,
          title: "Song",
          display_artist: "Artist",
          duration_in_ms: 1.5,
        },
      },
      {
        id: "empty",
        music_asset_info: {
          audio_asset_id: " ",
          title: "Song",
          display_artist: "Artist",
          duration_in_ms: "1000",
        },
      },
    ],
  });
  const observations = present(read(new StoryRepository(database), "m1").musicObservations);
  assert.equal(observations[0].providerOccurrenceId, "42");
  assert.equal(observations[0].metadata.instagramAudioAssetId, "123");
  assert.equal(observations[0].metadata.durationMs, 1000);
  assert.equal(observations[0].metadata.status, "usable");
  for (const entry of observations.slice(1)) {
    assert.equal(entry.metadata.instagramAudioAssetId, null);
    assert.equal(entry.metadata.durationMs, null);
    assert.equal(entry.metadata.status, "partial");
  }
});

test("received music media survives sparse observations and partial promotion in cold reads", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({
    pk: "media",
    story_music_stickers: [
      {
        id: "s",
        music_asset_info: {
          audio_asset_id: "audio",
          title: "Song",
          progressive_download_url: "https://example.com/primary.m4a",
          fast_start_progressive_download_url: "https://example.com/fallback.mp3",
          cover_artwork_uri: "",
          cover_artwork_thumbnail_uri: "https://example.com/art.jpg",
        },
      },
    ],
  });
  const before = read(repository, "media");
  const [partial] = present(before.musicObservations);
  assert.equal(partial.metadata.status, "partial");
  assert.equal(partial.metadata.audioSourceUrl, "https://example.com/primary.m4a");
  assert.equal(partial.metadata.artworkSourceUrl, "https://example.com/art.jpg");
  await repository.save({
    pk: "media",
    story_music_stickers: [
      {
        id: "s",
        music_asset_info: {
          audio_asset_id: "audio",
          display_artist: "Artist",
          progressive_download_url: "",
        },
      },
    ],
  });
  const after = read(new StoryRepository(database), "media");
  assert.deepEqual(after.stickers, before.stickers);
  const [promoted] = present(after.musicObservations);
  assert.equal(promoted.metadata.status, "usable");
  assert.equal(promoted.metadata.audioSourceUrl, "https://example.com/primary.m4a");
  assert.equal(promoted.metadata.artworkSourceUrl, "https://example.com/art.jpg");
  assert.equal(promoted.metadata.audioState, "pending");
  assert.equal(promoted.metadata.artworkState, "pending");
});
