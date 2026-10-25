import assert from "node:assert/strict";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import type { StoryItem } from "../sdk/lib/types.ts";
import type { JsonObject } from "../sdk/lib/json-value.ts";
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
  const story = repository.findByMediaPk(pk);
  assert.ok(story?.annotations);
  return story.annotations;
}

test("promotion remains shared when another source omits the already known place ID in the same save", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_bloks_stickers: [
      { id: "b", bloks_sticker: { sticker_data: { location: { pk: "place", name: "Before" } } } },
    ],
    story_locations: [{ id: "a", location: { pk: "place", name: "Before" } }],
  });
  await repository.save({
    pk: "m1",
    story_bloks_stickers: [
      {
        id: "b",
        bloks_sticker: {
          sticker_data: { location: { pk: "place", name: "Updated", lat: 48, lng: 2 } },
        },
      },
    ],
    story_locations: [{ id: "a", location: { address: "Received address" } }],
  });
  const observations = present(read(new StoryRepository(database), "m1").locationObservations);
  assert.equal(observations.length, 2);
  assert.deepEqual(observations[0].metadata, observations[1].metadata);
  assert.equal(observations[0].metadata.status, "usable");
  assert.equal(observations[0].metadata.name, "Updated");
  assert.equal(observations[0].metadata.address, "Received address");
  assert.equal(observations[0].metadata.latitude, 48);
  assert.equal(observations[0].metadata.longitude, 2);
});

test("live ingestion shares tagged places and exposes exact metadata with occurrences in cold account history", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const owner = { id: "u1", pk: "u1", username: "one", full_name: "One" };
  await new InstagramUserRepository(database).save(owner);
  const location = {
    pk: "00012345678901234567890",
    name: "Paris",
    address: "Paris",
    lat: 48.8566,
    lng: 2.3522,
    facebook_places_id: "00042",
    external_source: "facebook_places",
  };
  const items: Array<StoryItem> = [
    {
      pk: "m1",
      taken_at: 1_767_225_600,
      story_locations: [
        { id: "a", location },
        { id: "b", location },
      ],
    },
    {
      pk: "m2",
      taken_at: 1_767_225_601,
      story_locations: [{ id: "c", location: { ...location, address: "" } }],
    },
    {
      pk: "m3",
      taken_at: 1_767_225_602,
      story_locations: [{ id: "d", location: { ...location, pk: "different" } }],
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
      storyRepository: new StoryRepository(database),
      storyStorage: createMemoryStorage<StoryItem>(),
    },
  );
  assert.deepEqual(report.manifest.users[0].stories[0].locations, ["Paris, Paris", "Paris, Paris"]);
  const history = new StoryRepository(database).listByUsername("one");
  const first = present(present(history.find(({ story }) => story.pk === "m1")).story.annotations);
  const shared = present(present(history.find(({ story }) => story.pk === "m2")).story.annotations);
  const homonym = present(
    present(history.find(({ story }) => story.pk === "m3")).story.annotations,
  );
  const places = present(first.locationObservations);
  assert.equal(places.length, 2);
  assert.deepEqual(
    places.map(({ occurrenceId }) => occurrenceId),
    first.stickers.map(({ occurrenceId }) => occurrenceId),
  );
  assert.notEqual(places[0].occurrenceId, places[1].occurrenceId);
  assert.deepEqual(places[0].metadata, {
    status: "usable",
    id: places[0].metadata.id,
    instagramPlaceId: location.pk,
    name: "Paris",
    address: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    facebookPlacesId: "00042",
    externalSource: "facebook_places",
  });
  assert.equal(present(shared.locationObservations)[0].metadata.id, places[0].metadata.id);
  assert.notEqual(present(homonym.locationObservations)[0].metadata.id, places[0].metadata.id);
  assert.equal(history[0].owner_pk, "u1");
});

test("ID-only observations preserve known contributions and promote every certain link without another fetch", async (context) => {
  const { database } = setup(context);
  const logger = createCapturingLogger();
  const repository = new StoryRepository(database, logger);
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "a", location: { pk: "place", name: "Before" } }],
  });
  await repository.save({ pk: "m2", story_locations: [{ id: "b", location: { pk: "place" } }] });
  const original = read(new StoryRepository(database), "m1");
  const partial = read(new StoryRepository(database), "m2");
  assert.deepEqual(partial.stickers, []);
  assert.equal(present(partial.locationObservations)[0].metadata.status, "partial");
  assert.equal(
    present(partial.locationObservations)[0].metadata.id,
    original.locationObservations?.[0].metadata.id,
  );
  assert.equal(present(partial.locationObservations)[0].providerOccurrenceId, "b");
  assert.equal(present(partial.locationObservations)[0].occurrenceId, null);
  await repository.save({ pk: "m1", story_locations: [{ id: "a", location: { pk: "place" } }] });
  assert.deepEqual(read(repository, "m1").stickers, original.stickers);
  await repository.save({
    pk: "m3",
    story_locations: [{ id: "c", location: { pk: "place", lat: 0, lng: 0 } }],
  });
  const promoted = read(new StoryRepository(database), "m1");
  const shared = read(new StoryRepository(database), "m2");
  assert.deepEqual(promoted.stickers, original.stickers);
  for (const annotations of [promoted, shared]) {
    assert.equal(present(annotations.locationObservations)[0].metadata.status, "usable");
    assert.equal(
      present(annotations.locationObservations)[0].metadata.id,
      present(original.locationObservations)[0].metadata.id,
    );
    assert.equal(present(annotations.locationObservations)[0].metadata.latitude, 0);
    assert.equal(present(annotations.locationObservations)[0].metadata.longitude, 0);
    assert.equal(present(annotations.locationObservations)[0].metadata.address, null);
  }
  // A later sparse live response cannot erase the name, coordinates or links.
  await repository.save({
    pk: "m2",
    story_locations: [{ id: "b", location: { pk: "place", name: "", address: "" } }],
  });
  assert.deepEqual(read(new StoryRepository(database), "m2"), shared);
  assert.deepEqual(logger.messages, []);
});

test("coordinates are validated and partial places without provider identity never merge by text", async (context) => {
  const { database, repository } = setup(context);
  const observations: Array<JsonObject> = [
    { pk: "north", name: "Same", lat: 90, lng: 180 },
    { pk: "south", name: "Same", lat: -90, lng: -180 },
    { pk: "bad-lat", name: "Same", lat: 91, lng: 2 },
    { pk: "bad-lng", name: "Same", lat: 48, lng: -181 },
    { pk: "half", name: "Same", lat: 48 },
    { pk: "string", name: "Same", lat: "48", lng: "2" },
    { name: "Same" },
    { name: "Same" },
  ];
  await repository.save({
    pk: "m1",
    story_locations: observations.map((location, index) => ({ id: `sticker-${index}`, location })),
  });
  const stored = read(new StoryRepository(database), "m1");
  assert.equal(stored.stickers.length, 8);
  const metadata = present(stored.locationObservations).map(({ metadata: entry }) => entry);
  assert.deepEqual(
    metadata.map(({ status }) => status),
    ["usable", "usable", "partial", "partial", "partial", "partial", "partial", "partial"],
  );
  assert.equal(metadata[2].latitude, null);
  assert.equal(metadata[3].longitude, null);
  assert.equal(metadata[5].latitude, null);
  assert.equal(metadata[5].longitude, null);
  assert.notEqual(metadata[6].id, metadata[7].id);
  await repository.save({
    pk: "m1",
    story_locations: [
      { id: "sticker-6", location: { name: "Same", lat: 1, lng: 2 } },
      { id: "sticker-7", location: { name: "Same" } },
    ],
  });
  const promoted = present(read(new StoryRepository(database), "m1").locationObservations);
  assert.equal(promoted[0].metadata.status, "usable");
  assert.equal(promoted[0].metadata.id, metadata[6].id);
  assert.equal(promoted[1].metadata.status, "partial");
  assert.equal(promoted[1].metadata.id, metadata[7].id);
});

test("place links survive reordering and cold saves while explicit source clearing removes only that source", async (context) => {
  const { database, repository } = setup(context);
  const a = { id: "a", location: { pk: "one", name: "One", lat: 1, lng: 2 } };
  const b = { id: "b", location: { pk: "two", name: "Two", lat: 3, lng: 4 } };
  await repository.save({
    pk: "m1",
    story_locations: [a, b],
    story_bloks_stickers: [
      {
        id: "c",
        bloks_sticker: {
          sticker_data: {
            location: { pk: "three", name: "Three", lat: 5, lng: 6 },
            ig_mention: { username: "friend" },
          },
        },
      },
    ],
  });
  const before = read(repository, "m1");
  const byProvider = new Map(
    present(before.locationObservations).map((entry) => [entry.providerOccurrenceId, entry]),
  );
  await repository.save({ pk: "m1", story_locations: [b, a] });
  const reordered = read(new StoryRepository(database), "m1");
  for (const entry of present(reordered.locationObservations)) {
    assert.deepEqual(entry, byProvider.get(entry.providerOccurrenceId));
  }
  await repository.save(present(repository.findByMediaPk("m1")));
  assert.deepEqual(read(new StoryRepository(database), "m1"), reordered);
  await repository.save({ pk: "m1", story_locations: [] });
  const cleared = read(new StoryRepository(database), "m1");
  assert.deepEqual(cleared.locations, ["Three"]);
  assert.equal(present(cleared.locationObservations).length, 1);
  assert.deepEqual(present(cleared.locationObservations)[0], byProvider.get("c"));
  await repository.save({ pk: "m1", story_bloks_stickers: [] });
  assert.deepEqual(read(new StoryRepository(database), "m1").stickers, []);
  assert.equal(read(repository, "m1").locationObservations, undefined);
});

test("failed promotion rolls back metadata, occurrence links, ownership and media together", async (context) => {
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
      story_locations: [{ id: "a", location: { pk: "place", name: "Old" } }],
    },
    owner,
  );
  await repository.save({ pk: "m2", story_locations: [{ id: "b", location: { pk: "place" } }] });
  const before = repository.findByMediaPk("m1");
  const partial = repository.findByMediaPk("m2");
  database.$client
    .exec(`CREATE TEMP TRIGGER reject_promotion BEFORE UPDATE ON story_location_observations
    WHEN NEW.locationId IS NOT NULL BEGIN SELECT RAISE(ABORT, 'fixture promotion failure'); END`);
  await assert.rejects(
    repository.save(
      {
        pk: "m1",
        taken_at: 1_767_225_601,
        media_type: 2,
        image_versions2: { candidates: [{ url: "https://example.com/new.jpg" }] },
        story_locations: [{ id: "a", location: { pk: "place", name: "New", lat: 48, lng: 2 } }],
      },
      other,
    ),
  );
  const cold = new StoryRepository(database);
  assert.deepEqual(cold.findByMediaPk("m1"), before);
  assert.deepEqual(cold.findByMediaPk("m2"), partial);
  assert.equal(cold.listByUsername("one").length, 1);
  assert.equal(cold.listByUsername("two").length, 0);
  database.$client.exec("DROP TRIGGER reject_promotion");
  await repository.save({
    pk: "m2",
    story_locations: [{ id: "b", location: { pk: "place", lat: 48, lng: 2 } }],
  });
  assert.equal(present(read(cold, "m1").locationObservations)[0].metadata.status, "usable");
  assert.equal(present(read(cold, "m1").locationObservations)[0].metadata.name, "Old");
});

test("mixed labelled and ID-only locations keep valid labels and preserve earlier contributions", async (context) => {
  const { database, repository } = setup(context);
  const first = { id: "a", location: { pk: "one", name: "One", lat: 1, lng: 2 } };
  const partial = { id: "b", location: { pk: "two" } };
  await repository.save({ pk: "m1", story_locations: [first, partial] });
  const stored = read(new StoryRepository(database), "m1");
  assert.deepEqual(stored.locations, ["One"]);
  assert.equal(present(stored.locationObservations).length, 2);
  assert.equal(
    present(stored.locationObservations)[0].occurrenceId,
    stored.stickers[0].occurrenceId,
  );
  assert.equal(present(stored.locationObservations)[1].occurrenceId, null);
  await repository.save({ pk: "m1", story_locations: [partial] });
  assert.deepEqual(read(repository, "m1").stickers, stored.stickers);
  // Incompleteness in one occurrence must not drop the new labelled occurrence.
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "c", location: { pk: "three", name: "Three" } }, partial],
  });
  const updated = read(new StoryRepository(database), "m1");
  assert.deepEqual(updated.locations, ["One", "Three"]);
  assert.equal(
    present(updated.locationObservations).find(
      ({ providerOccurrenceId }) => providerOccurrenceId === "a",
    )?.occurrenceId,
    stored.stickers[0].occurrenceId,
  );
});

test("malformed and omitted sources preserve metadata while live nonempty values update shared places", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [
      {
        id: "a",
        location: {
          pk: "place",
          name: "  Received name  ",
          address: "Address",
          lat: 48,
          lng: 2,
          facebook_places_id: "0001",
        },
      },
    ],
  });
  const before = read(repository, "m1");
  for (const value of [
    null,
    "malformed",
    [{ id: "a", location: { pk: "place", name: "Corrupt", lat: 1, lng: 2 } }, null],
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Each observation must be independently persisted and cold-read.
    await repository.save({ pk: "m1", story_locations: value });
    assert.deepEqual(read(new StoryRepository(database), "m1"), before);
  }
  await repository.save({ pk: "m1", story_hashtags: [{ hashtag: "other-source" }] });
  assert.deepEqual(read(repository, "m1").locationObservations, before.locationObservations);
  await repository.save({
    pk: "m2",
    story_locations: [
      {
        location: {
          pk: "place",
          name: "Updated",
          address: "",
          lat: 999,
          lng: "invalid",
          facebook_places_id: "",
        },
      },
    ],
  });
  const [{ metadata }] = present(read(new StoryRepository(database), "m1").locationObservations);
  assert.equal(metadata.status, "usable");
  assert.equal(metadata.name, "Updated");
  assert.equal(metadata.address, "Address");
  assert.equal(metadata.latitude, 48);
  assert.equal(metadata.longitude, 2);
  assert.equal(metadata.facebookPlacesId, "0001");
  assert.deepEqual(
    read(repository, "m1").stickers.filter(({ kind }) => kind === "location"),
    before.stickers,
  );
});

test("current extraction links repeated unidentifiable occurrences without guessing across observations", async (context) => {
  const { database, repository } = setup(context);
  const location = { name: "Same", lat: 48, lng: 2 };
  const partial = { id: "unlabelled", location: { pk: "partial" } };
  await repository.save({ pk: "m1", story_locations: [{ location }, { location }, partial] });
  const before = read(repository, "m1");
  const located = present(before.locationObservations).filter(
    ({ metadata }) => metadata.status === "usable",
  );
  assert.equal(located.length, 2);
  assert.notEqual(located[0].metadata.id, located[1].metadata.id);
  assert.deepEqual(
    located.map(({ occurrenceId }) => occurrenceId),
    before.stickers.map(({ occurrenceId }) => occurrenceId),
  );
  await repository.save({ pk: "m1", story_locations: [{ location }, { location }] });
  const after = read(new StoryRepository(database), "m1");
  assert.equal(after.stickers.length, 2);
  for (const entry of present(after.locationObservations)) {
    assert.ok(after.stickers.some(({ occurrenceId }) => occurrenceId === entry.occurrenceId));
    assert.ok(located.every((old) => old.metadata.id !== entry.metadata.id));
  }
});
