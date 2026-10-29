import { assert, test, expect } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import type { StoryItem } from "../sdk/instagram-types.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  reel,
  reelsResponse,
} from "./mock-helpers.ts";

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
  return { database, repository: new StoryRepository(database, createCapturingLogger()) };
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
      [reelsResponse({ r1: { ...reel("r1", items), user: owner } })],
    ),
    {
      logger: createCapturingLogger(),
      now: fixedNow,
      storyRepository: repository,
      storyStorage: createMemoryStorage<StoryItem>(),
    },
  );
  expect(report.manifest.users[0].stories[0].stickers).toStrictEqual([
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
  expect(observations.length).toBe(2);
  expect(observations.map(({ occurrenceId }) => occurrenceId)).toStrictEqual(
    first.stickers.map(({ occurrenceId }) => occurrenceId),
  );
  expect(observations[0].occurrenceId).not.toBe(observations[1].occurrenceId);
  expect(observations.map(({ providerOccurrenceId }) => providerOccurrenceId)).toStrictEqual([
    "a",
    "b",
  ]);
  expect(observations[0].metadata).toStrictEqual({
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
  expect(observations[0].metadata).toStrictEqual(observations[1].metadata);
  expect(present(shared.musicObservations)[0].metadata).toStrictEqual(observations[0].metadata);
  expect(present(homonym.musicObservations)[0].metadata.id).not.toBe(observations[0].metadata.id);
  expect(history[0].owner_pk).toBe("u1");
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
  expect(stored.stickers.map(({ label }) => label)).toStrictEqual([
    "Song",
    "Song - Artist",
    "Song - Artist",
  ]);
  const observations = present(stored.musicObservations);
  expect(observations.length).toBe(5);
  expect(new Set(observations.map(({ metadata }) => metadata.id)).size).toBe(5);
  expect(observations.map(({ occurrenceId }) => occurrenceId)).toStrictEqual([
    null,
    null,
    ...stored.stickers.map(({ occurrenceId }) => occurrenceId),
  ]);
  expect(observations.map(({ metadata }) => metadata.instagramAudioAssetId)).toStrictEqual([
    null,
    "known",
    "other",
    null,
    null,
  ]);
  expect(observations.map(({ metadata }) => metadata.status)).toStrictEqual([
    "partial",
    "partial",
    "partial",
    "partial",
    "partial",
  ]);
  expect(observations.map(({ metadata }) => metadata.durationMs)).toStrictEqual([
    null,
    null,
    null,
    null,
    null,
  ]);
  expect(observations[0].providerOccurrenceId).toBe("sticker-only");
  expect(observations[0].metadata.title).toBe(null);
  expect(observations[0].metadata.artist).toBe(null);
  expect(logger.messages).toStrictEqual([]);
});

test("an outer music sticker ID alone is retained as an anonymous partial observation", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({ pk: "m1", story_music_stickers: [{ id: "outer-only" }] });
  const stored = read(new StoryRepository(database), "m1");
  expect(stored.stickers).toStrictEqual([]);
  const [observation] = present(stored.musicObservations);
  expect(observation.providerOccurrenceId).toBe("outer-only");
  expect(observation.occurrenceId).toBe(null);
  expect(observation.metadata.status).toBe("partial");
  expect(observation.metadata.instagramAudioAssetId).toBe(null);
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
  expect(promoted.stickers).toStrictEqual(before.stickers);
  const [observation] = present(promoted.musicObservations);
  expect(observation.metadata.status).toBe("usable");
  expect(observation.metadata.id).toBe(shared.metadata.id);
  expect(observation.metadata.title).toBe("Song");
  expect(observation.metadata.artist).toBe("Artist");
  expect(observation.metadata.durationMs).toBe(null);
  expect(observation.occurrenceId).toBe(before.stickers[0].occurrenceId);
  expect(
    present(read(new StoryRepository(database), "m2").musicObservations)[0].metadata,
  ).toStrictEqual(observation.metadata);
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
  expect(sparse.stickers).toStrictEqual(before.stickers);
  const [{ metadata }] = present(sparse.musicObservations);
  expect(metadata.id).toBe(shared.metadata.id);
  expect(metadata.status).toBe("usable");
  expect(metadata.instagramAudioAssetId).toBe("audio");
  expect(metadata.title).toBe("Updated");
  expect(metadata.artist).toBe("Artist");
  expect(metadata.durationMs).toBe(123_456);
  expect(
    present(read(new StoryRepository(database), "m2").musicObservations)[0].metadata,
  ).toStrictEqual(metadata);
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
  expect(
    present(reordered.musicObservations).map(({ providerOccurrenceId }) => providerOccurrenceId),
  ).toStrictEqual(["b", "a"]);
  for (const entry of present(reordered.musicObservations)) {
    expect(entry).toStrictEqual(byProvider.get(entry.providerOccurrenceId));
  }
  await repository.save(present(new StoryRepository(database).findByMediaPk("m1")));
  expect(read(new StoryRepository(database), "m1")).toStrictEqual(reordered);
  await repository.save({ pk: "m1", story_music_stickers: [] });
  const cleared = read(new StoryRepository(database), "m1");
  expect(cleared.musicObservations).toBe(undefined);
  expect(cleared.locationObservations).toStrictEqual(before.locationObservations);
  expect(cleared.stickers).toStrictEqual(before.stickers.filter(({ kind }) => kind === "location"));
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
    expect(read(new StoryRepository(database), "m1")).toStrictEqual(before);
  }
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
  expect(after.occurrenceId).toBe(before.occurrenceId);
  expect(after.metadata.id).not.toBe(before.metadata.id);
  expect(after.metadata.instagramAudioAssetId).toBe("new");
  expect(after.metadata.status).toBe("partial");
  expect(after.metadata.artist).toBe(null);
  expect(after.metadata.durationMs).toBe(null);
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
  expect(before.stickers.length).toBe(3);
  expect(observations.map(({ occurrenceId }) => occurrenceId)).toStrictEqual([
    ...before.stickers.map(({ occurrenceId }) => occurrenceId),
    null,
  ]);
  expect(observations[0].metadata.id).not.toBe(observations[1].metadata.id);
  await repository.save({
    pk: "m1",
    story_music_stickers: [{ music_asset_info: anonymous }, { music_asset_info: anonymous }],
  });
  const after = read(new StoryRepository(database), "m1");
  expect(after.stickers.length).toBe(2);
  for (const entry of present(after.musicObservations)) {
    expect(
      after.stickers.some(({ occurrenceId }) => occurrenceId === entry.occurrenceId),
    ).toBeTruthy();
    expect(observations.every((old) => old.metadata.id !== entry.metadata.id)).toBeTruthy();
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
  expect(observations[0].providerOccurrenceId).toBe("42");
  expect(observations[0].metadata.instagramAudioAssetId).toBe("123");
  expect(observations[0].metadata.durationMs).toBe(1000);
  expect(observations[0].metadata.status).toBe("usable");
  for (const entry of observations.slice(1)) {
    expect(entry.metadata.instagramAudioAssetId).toBe(null);
    expect(entry.metadata.durationMs).toBe(null);
    expect(entry.metadata.status).toBe("partial");
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
  expect(partial.metadata.status).toBe("partial");
  expect(partial.metadata.audioSourceUrl).toBe("https://example.com/primary.m4a");
  expect(partial.metadata.artworkSourceUrl).toBe("https://example.com/art.jpg");
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
  expect(after.stickers).toStrictEqual(before.stickers);
  const [promoted] = present(after.musicObservations);
  expect(promoted.metadata.status).toBe("usable");
  expect(promoted.metadata.audioSourceUrl).toBe("https://example.com/primary.m4a");
  expect(promoted.metadata.artworkSourceUrl).toBe("https://example.com/art.jpg");
  expect(promoted.metadata.audioState).toBe("pending");
  expect(promoted.metadata.artworkState).toBe("pending");
});
