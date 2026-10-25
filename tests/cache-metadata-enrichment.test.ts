import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import type { JsonValue } from "../sdk/lib/json-value.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { runCacheMetadataEnrichment } from "../scripts/enrich-sticker-metadata.ts";
import { ReportRepository } from "../sdk/repositories/report-repository.ts";

function present<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined);
  return value;
}

async function setup(context: { onTestFinished: (callback: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(tmpdir(), "sticker-backfill-"));
  const databasePath = path.join(directory, "stories.sqlite");
  const database = createDrizzle(databasePath);
  migrateDatabase(database);
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    database,
    directory,
    databasePath,
    repository: new StoryRepository(database),
    run: async () => await runCacheMetadataEnrichment({ databasePath, cacheDirectory: directory }),
    cache: async (name: string, value: JsonValue) => {
      await writeFile(path.join(directory, `${name}.json`), JSON.stringify(value));
    },
  };
}

test("operator enriches raw fields despite calculated annotations, preserving story data on replay", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  await repository.save({
    pk: "one",
    accessibility_caption: "Current caption",
    annotations: {
      locations: ["Original location"],
      stickers: [
        {
          kind: "location",
          source: "story_locations",
          providerOccurrenceId: "loc",
          label: "Original location",
        },
        {
          kind: "music",
          source: "story_music_stickers",
          providerOccurrenceId: "song",
          label: "Original song",
        },
        { kind: "mention", label: "@friend" },
      ],
    },
  });
  const before = repository.findByMediaPk("one");
  await cache("one", {
    pk: "one",
    accessibility_caption: "Stale",
    annotations: "ignored calculated value",
    story_locations: [
      { id: "loc", location: { pk: "place", name: "Paris", lat: 48.85, lng: 2.35 } },
    ],
    story_music_stickers: [
      {
        id: "song",
        music_asset_info: { audio_asset_id: "audio", title: "Song", display_artist: "Artist" },
      },
    ],
  });
  const result = await run();
  assert.equal(result.enriched, 2);
  assert.equal(result.invalid, 0);
  const stored = present(new StoryRepository(database).findByMediaPk("one"));
  assert.equal(stored.accessibility_caption, "Current caption");
  assert.deepEqual(stored.annotations?.stickers, before?.annotations?.stickers);
  const [location] = present(stored.annotations?.locationObservations);
  const [music] = present(stored.annotations?.musicObservations);
  assert.equal(location.metadata.latitude, 48.85);
  assert.equal(location.occurrenceId, before?.annotations?.stickers[0].occurrenceId);
  assert.equal(music.metadata.instagramAudioAssetId, "audio");
  assert.equal(music.occurrenceId, before?.annotations?.stickers[1].occurrenceId);
  await run();
  assert.deepEqual(new StoryRepository(database).findByMediaPk("one"), stored);
});

test("older cache fills gaps and promotes shared partials without changing newer values or labels", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  await repository.save({
    pk: "one",
    story_locations: [{ id: "loc", location: { pk: "place", name: "Current" } }],
    story_music_stickers: [
      { id: "song", music_asset_info: { audio_asset_id: "audio", title: "Current title" } },
    ],
  });
  await repository.save({
    pk: "two",
    story_locations: [{ id: "other-loc", location: { pk: "place" } }],
    story_music_stickers: [{ id: "other-song", music_asset_info: { audio_asset_id: "audio" } }],
  });
  const before = repository.findByMediaPk("one")?.annotations?.stickers;
  await cache("one", {
    pk: "one",
    story_locations: [
      {
        id: "loc",
        location: { pk: "place", name: "Stale", address: "Recovered address", lat: 10, lng: 20 },
      },
    ],
    story_music_stickers: [
      {
        id: "song",
        music_asset_info: {
          audio_asset_id: "audio",
          title: "Stale title",
          display_artist: "Recovered artist",
          duration_in_ms: 1234,
        },
      },
    ],
  });
  const result = await run();
  assert.equal(result.enriched, 2);
  const cold = new StoryRepository(database);
  const first = present(present(cold.findByMediaPk("one")).annotations);
  const second = present(present(cold.findByMediaPk("two")).annotations);
  const [location] = present(first.locationObservations);
  const [music] = present(first.musicObservations);
  const [sharedLocation] = present(second.locationObservations);
  const [sharedMusic] = present(second.musicObservations);
  assert.deepEqual(first.stickers, before);
  assert.equal(location.metadata.name, "Current");
  assert.equal(location.metadata.address, "Recovered address");
  assert.equal(location.metadata.status, "usable");
  assert.equal(music.metadata.title, "Current title");
  assert.equal(music.metadata.artist, "Recovered artist");
  assert.equal(music.metadata.status, "usable");
  assert.deepEqual(location.metadata, sharedLocation.metadata);
  assert.deepEqual(music.metadata, sharedMusic.metadata);
  await cache("one", {
    pk: "one",
    story_locations: [{ id: "loc", location: { pk: "place", lat: -10, lng: -20, name: "Older" } }],
    story_music_stickers: [
      {
        id: "song",
        music_asset_info: {
          audio_asset_id: "audio",
          title: "Older",
          display_artist: "Older",
          duration_in_ms: 9876,
        },
      },
    ],
  });
  await run();
  assert.deepEqual(cold.findByMediaPk("one")?.annotations, first);
});

test("identical labels and stale positions never link ambiguous evidence, and duplicate replay remains stable", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  await repository.save({
    pk: "one",
    annotations: {
      locations: [],
      stickers: [
        { kind: "music", source: "story_music_stickers", label: "Same - Artist" },
        { kind: "music", source: "story_music_stickers", label: "Same - Artist" },
        { kind: "location", source: "story_locations", label: "Same place" },
        { kind: "location", source: "story_locations", label: "Same place" },
      ],
    },
  });
  const anonymous = { music_asset_info: { title: "Same", display_artist: "Artist" } };
  const place = { location: { name: "Same place" } };
  await cache("one", {
    pk: "one",
    story_music_stickers: [anonymous, anonymous],
    story_locations: [place, place],
  });
  const result = await run();
  assert.equal(result.partial, 4);
  assert.equal(result.uncertain, 4);
  const first = present(new StoryRepository(database).findByMediaPk("one"));
  const music = first.annotations?.musicObservations ?? [];
  const locations = first.annotations?.locationObservations ?? [];
  assert.equal(music.length, 2);
  assert.equal(locations.length, 2);
  assert.notEqual(music[0].metadata.id, music[1].metadata.id);
  assert.notEqual(locations[0].metadata.id, locations[1].metadata.id);
  assert.ok([...music, ...locations].every(({ occurrenceId }) => occurrenceId === null));
  await run();
  assert.deepEqual(new StoryRepository(database).findByMediaPk("one"), first);
});

test("missing stories and malformed files are reported while valid cold account history is enriched", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  const owner = { pk: "owner", id: "owner", username: "owner", full_name: "Owner" };
  await new InstagramUserRepository(database).save(owner);
  await repository.save(
    {
      pk: "one",
      taken_at: 123,
      media_type: 1,
      image_versions2: { candidates: [{ url: "https://example.com/current.jpg" }] },
      annotations: {
        locations: [],
        stickers: [
          {
            kind: "music",
            label: "Song",
            source: "story_music_stickers",
            providerOccurrenceId: "song",
          },
        ],
      },
    },
    owner,
  );
  const input = {
    pk: "one",
    taken_at: 0,
    story_music_stickers: [{ id: "song", music_asset_info: { title: "Recovered" } }],
  };
  await cache("one", input);
  await cache("absent", { ...input, pk: "absent" });
  await cache("invalid", { annotations: [] });
  await cache("null", null);
  const totals = await run();
  assert.deepEqual(totals, {
    enriched: 0,
    partial: 1,
    skipped: 1,
    uncertain: 0,
    invalid: 2,
    failed: 0,
  });
  const cold = new StoryRepository(database);
  assert.equal(cold.findByMediaPk("absent"), null);
  const [history] = cold.listByUsername("owner");
  assert.equal(history.owner_pk, "owner");
  assert.equal(history.story.taken_at, 123);
  assert.equal(
    history.story.image_versions2?.candidates?.[0].url,
    "https://example.com/current.jpg",
  );
  assert.equal(history.story.annotations?.musicObservations?.[0].metadata.title, "Recovered");
});

test("promotion failures roll back the whole cached story and allow a clean retry", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  await repository.save({
    pk: "one",
    story_music_stickers: [
      { id: "song", music_asset_info: { audio_asset_id: "audio", title: "Current" } },
    ],
  });
  const before = repository.findByMediaPk("one");
  await cache("one", {
    pk: "one",
    story_locations: [{ id: "loc", location: { pk: "place", lat: 10, lng: 20 } }],
    story_music_stickers: [
      { id: "song", music_asset_info: { audio_asset_id: "audio", display_artist: "Artist" } },
    ],
  });
  database.$client.exec(
    "CREATE TRIGGER reject_backfill BEFORE DELETE ON metadata_music_partial BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
  );
  const failure = await run();
  assert.equal(failure.failed, 1);
  assert.deepEqual(new StoryRepository(database).findByMediaPk("one"), before);
  database.$client.exec("DROP TRIGGER reject_backfill");
  const result = await run();
  assert.equal(result.enriched, 2);
  const after = new StoryRepository(database).findByMediaPk("one");
  await run();
  assert.deepEqual(new StoryRepository(database).findByMediaPk("one"), after);
});

test("uninitialized and absent database paths are rejected without migration or creation", async (context) => {
  const { database, cache, run } = await setup(context);
  await cache("one", { pk: "one" });
  database.$client.exec("DROP TABLE story_music_observations");
  await assert.rejects(run());
  assert.throws(() => database.$client.prepare("SELECT * FROM story_music_observations"));
  await assert.rejects(
    runCacheMetadataEnrichment({
      databasePath: "/nonexistent/sticker-backfill.sqlite",
      cacheDirectory: "/nonexistent",
    }),
  );
});

test("cached anonymous evidence does not duplicate existing live observations or claim their identity", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  const raw = {
    pk: "one",
    story_music_stickers: [{ music_asset_info: { title: "Same", display_artist: "Artist" } }],
    story_locations: [{ location: { name: "Place" } }],
  };
  await repository.save(raw);
  const before = repository.findByMediaPk("one");
  await cache("one", raw);
  const result = await run();
  assert.equal(result.uncertain, 2);
  assert.deepEqual(new StoryRepository(database).findByMediaPk("one"), before);
});

test("reordered duplicate provider IDs stay unlinked and replay keys do not use array position", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  await repository.save({
    pk: "one",
    annotations: {
      locations: [],
      stickers: [
        {
          kind: "music",
          label: "Same",
          source: "story_music_stickers",
          providerOccurrenceId: "duplicate",
        },
        {
          kind: "music",
          label: "Same",
          source: "story_music_stickers",
          providerOccurrenceId: "duplicate",
        },
      ],
    },
  });
  const a = {
    id: "duplicate",
    music_asset_info: { audio_asset_id: "a", title: "Same", display_artist: "Artist" },
  };
  const b = {
    id: "duplicate",
    music_asset_info: { audio_asset_id: "b", title: "Same", display_artist: "Artist" },
  };
  await cache("one", { pk: "one", story_music_stickers: [a, b] });
  const result = await run();
  assert.equal(result.enriched, 2);
  assert.equal(result.uncertain, 2);
  const before = present(repository.findByMediaPk("one"));
  const observations = present(before.annotations?.musicObservations);
  assert.deepEqual(
    observations.map(({ occurrenceId }) => occurrenceId),
    [null, null],
  );
  assert.notEqual(observations[0].metadata.id, observations[1].metadata.id);
  await cache("one", { pk: "one", story_music_stickers: [b, a] });
  await run();
  assert.deepEqual(new StoryRepository(database).findByMediaPk("one"), before);
});

test("conflicting asset identities and malformed sources preserve newer observations and report snapshots", async (context) => {
  const { database, repository, directory, run, cache } = await setup(context);
  await repository.save({
    pk: "one",
    story_music_stickers: [
      {
        id: "song",
        music_asset_info: { audio_asset_id: "current", title: "Current", display_artist: "Artist" },
      },
    ],
  });
  const reports = new ReportRepository(database);
  await reports.save("snapshot", {
    failures: [],
    manifest: {
      users: [
        {
          media_ids: ["one"],
          order: 0,
          reel_id: "reel",
          username: "owner",
          stories: [
            {
              ig_caption: "Snapshot caption",
              locations: ["Snapshot place"],
              media_pk: "one",
              preview_image_url: null,
              stickers: ["Snapshot song"],
              status: "ok",
            },
          ],
        },
      ],
    },
    output: { users: [] },
    metadata: {
      broadcasts_count: 0,
      counts: { cache_hits: 1, cache_misses: 0, failed: 0, fetched: 0, reels: 1, stories: 1 },
      created_at: "2026-10-25T00:00:00.000Z",
      report_name: "snapshot",
      status: "ok",
      story_ranking_token: null,
    },
  });
  const before = repository.findByMediaPk("one");
  const report = reports.findByKey("snapshot");
  await cache("one", {
    pk: "one",
    story_music_stickers: [
      {
        id: "song",
        music_asset_info: { audio_asset_id: "stale", title: "Older", display_artist: "Older" },
      },
    ],
  });
  const conflicting = await run();
  assert.equal(conflicting.uncertain, 1);
  assert.deepEqual(new StoryRepository(database).findByMediaPk("one"), before);
  await cache("one", {
    pk: "one",
    story_music_stickers: [null],
    story_locations: [{ location: { pk: "place", lat: 10, lng: 20 } }],
  });
  await writeFile(path.join(directory, "broken.json"), "{invalid JSON");
  const malformed = await run();
  assert.equal(malformed.invalid, 2);
  assert.equal(malformed.enriched, 1);
  assert.deepEqual(
    repository.findByMediaPk("one")?.annotations?.musicObservations,
    before?.annotations?.musicObservations,
  );
  assert.deepEqual(new ReportRepository(database).findByKey("snapshot"), report);
});

test("cache enrichment rejects malformed Bloks structures rejected by live ingestion", async (context) => {
  const { database, repository, run, cache } = await setup(context);
  await repository.save({ pk: "one" });
  await cache("one", {
    pk: "one",
    story_bloks_stickers: [{ id: "loc", location: { pk: "place", lat: 10, lng: 20 } }],
  });
  const result = await run();
  assert.equal(result.invalid, 1);
  assert.equal(result.enriched, 0);
  assert.equal(
    new StoryRepository(database).findByMediaPk("one")?.annotations?.locationObservations,
    undefined,
  );
});
