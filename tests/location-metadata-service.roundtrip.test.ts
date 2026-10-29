import { assert, test, expect } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import type { StoryItem } from "../sdk/instagram-types.ts";
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

test("external-ID-only locations survive cold reads as separate partial observations without labels", async (context) => {
  const { database } = setup(context);
  const logger = createCapturingLogger();
  const repository = new StoryRepository(database, logger);
  await repository.save({
    pk: "m1",
    story_locations: [
      {
        id: "both",
        location: { facebook_places_id: "000123", external_source: "facebook_places" },
      },
      { id: "id-only", location: { facebook_places_id: "000123" } },
      { id: "source-only", location: { external_source: "facebook_places" } },
    ],
  });
  const stored = read(new StoryRepository(database), "m1");
  expect(stored.locations).toStrictEqual([]);
  expect(stored.stickers).toStrictEqual([]);
  const observations = present(stored.locationObservations);
  expect(observations.length).toBe(3);
  expect(new Set(observations.map(({ metadata }) => metadata.id)).size).toBe(3);
  expect(observations.map(({ providerOccurrenceId }) => providerOccurrenceId)).toStrictEqual([
    "both",
    "id-only",
    "source-only",
  ]);
  expect(
    observations.map(({ metadata }) => [metadata.facebookPlacesId, metadata.externalSource]),
  ).toStrictEqual([
    ["000123", "facebook_places"],
    ["000123", null],
    [null, "facebook_places"],
  ]);
  for (const observation of observations) {
    expect(observation.source).toBe("story_locations");
    expect(observation.occurrenceId).toBe(null);
    expect(observation.metadata.status).toBe("partial");
    expect(observation.metadata.instagramPlaceId).toBe(null);
    expect(observation.metadata.name).toBe(null);
    expect(observation.metadata.address).toBe(null);
    expect(observation.metadata.latitude).toBe(null);
    expect(observation.metadata.longitude).toBe(null);
  }
  expect(logger.messages).toStrictEqual([]);
});

test("external-only observations do not block other location updates during live ingestion", async (context) => {
  const { database } = setup(context);
  const logger = createCapturingLogger();
  const repository = new StoryRepository(database, logger);
  const owner = { id: "u1", pk: "u1", username: "one", full_name: "One" };
  await new InstagramUserRepository(database).save(owner);
  await repository.save(
    {
      pk: "m1",
      taken_at: 1_767_225_600,
      story_locations: [
        { id: "located", location: { pk: "place", name: "Before", lat: 48, lng: 2 } },
      ],
    },
    owner,
  );
  const [before] = read(repository, "m1").stickers;
  const item: StoryItem = {
    pk: "m1",
    taken_at: 1_767_225_600,
    story_locations: [
      { id: "located", location: { pk: "place", name: "Updated", lat: 49, lng: 3 } },
      {
        id: "external",
        location: { facebook_places_id: "000123", external_source: "facebook_places" },
      },
      { facebook_places_id: "000456" },
    ],
  };
  const report = await fetchStoriesManifest(
    createClient(
      [{ id: "r1", media_ids: ["m1"], user: owner }],
      [response({ reels: { r1: { ...reel("r1", [item]), user: owner } } })],
    ),
    {
      logger,
      now: fixedNow,
      storyRepository: repository,
      storyStorage: createMemoryStorage<StoryItem>(),
    },
  );
  expect(report.manifest.users[0].stories[0].locations).toStrictEqual(["Updated"]);
  const [history] = new StoryRepository(database).listByUsername("one");
  const stored = present(history.story.annotations);
  expect(stored.locations).toStrictEqual(["Updated"]);
  expect(stored.stickers.length).toBe(1);
  expect(stored.stickers[0].occurrenceId).toBe(before.occurrenceId);
  const [located, external, direct] = present(stored.locationObservations);
  expect(located.metadata.status).toBe("usable");
  expect(located.metadata.name).toBe("Updated");
  expect(located.metadata.latitude).toBe(49);
  expect(located.metadata.longitude).toBe(3);
  expect(external.metadata.status).toBe("partial");
  expect(external.metadata.facebookPlacesId).toBe("000123");
  expect(external.metadata.externalSource).toBe("facebook_places");
  expect(direct.metadata.status).toBe("partial");
  expect(direct.metadata.facebookPlacesId).toBe("000456");
  expect(direct.metadata.instagramPlaceId).toBe(null);
  expect(direct.providerOccurrenceId).toBe(null);
  expect(
    logger.messages.some((message) => message.includes("Malformed story annotation source")),
  ).toBe(false);
});

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
  expect(observations.length).toBe(2);
  expect(observations[0].metadata).toStrictEqual(observations[1].metadata);
  expect(observations[0].metadata.status).toBe("usable");
  expect(observations[0].metadata.name).toBe("Updated");
  expect(observations[0].metadata.address).toBe("Received address");
  expect(observations[0].metadata.latitude).toBe(48);
  expect(observations[0].metadata.longitude).toBe(2);
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
  expect(report.manifest.users[0].stories[0].locations).toStrictEqual([
    "Paris, Paris",
    "Paris, Paris",
  ]);
  const history = new StoryRepository(database).listByUsername("one");
  const first = present(present(history.find(({ story }) => story.pk === "m1")).story.annotations);
  const shared = present(present(history.find(({ story }) => story.pk === "m2")).story.annotations);
  const homonym = present(
    present(history.find(({ story }) => story.pk === "m3")).story.annotations,
  );
  const places = present(first.locationObservations);
  expect(places.length).toBe(2);
  expect(places.map(({ occurrenceId }) => occurrenceId)).toStrictEqual(
    first.stickers.map(({ occurrenceId }) => occurrenceId),
  );
  expect(places[0].occurrenceId).not.toBe(places[1].occurrenceId);
  expect(places[0].metadata).toStrictEqual({
    status: "usable",
    id: places[0].metadata.id,
    instagramPlaceId: location.pk,
    name: "Paris",
    address: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    facebookPlacesId: "00042",
    externalSource: "facebook_places",
    category: null,
    city: null,
    zip: null,
    lastLookupAttemptAt: null,
    lastLookupFailure: null,
  });
  expect(present(shared.locationObservations)[0].metadata.id).toBe(places[0].metadata.id);
  expect(present(homonym.locationObservations)[0].metadata.id).not.toBe(places[0].metadata.id);
  expect(history[0].owner_pk).toBe("u1");
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
  expect(partial.stickers).toStrictEqual([]);
  expect(present(partial.locationObservations)[0].metadata.status).toBe("partial");
  expect(present(partial.locationObservations)[0].metadata.id).toBe(
    original.locationObservations?.[0].metadata.id,
  );
  expect(present(partial.locationObservations)[0].providerOccurrenceId).toBe("b");
  expect(present(partial.locationObservations)[0].occurrenceId).toBe(null);
  await repository.save({ pk: "m1", story_locations: [{ id: "a", location: { pk: "place" } }] });
  expect(read(repository, "m1").stickers).toStrictEqual(original.stickers);
  await repository.save({
    pk: "m3",
    story_locations: [{ id: "c", location: { pk: "place", lat: 0, lng: 0 } }],
  });
  const promoted = read(new StoryRepository(database), "m1");
  const shared = read(new StoryRepository(database), "m2");
  expect(promoted.stickers).toStrictEqual(original.stickers);
  for (const annotations of [promoted, shared]) {
    expect(present(annotations.locationObservations)[0].metadata.status).toBe("usable");
    expect(present(annotations.locationObservations)[0].metadata.id).toBe(
      present(original.locationObservations)[0].metadata.id,
    );
    expect(present(annotations.locationObservations)[0].metadata.latitude).toBe(0);
    expect(present(annotations.locationObservations)[0].metadata.longitude).toBe(0);
    expect(present(annotations.locationObservations)[0].metadata.address).toBe(null);
  }
  // A later sparse live response cannot erase the name, coordinates or links.
  await repository.save({
    pk: "m2",
    story_locations: [{ id: "b", location: { pk: "place", name: "", address: "" } }],
  });
  expect(read(new StoryRepository(database), "m2")).toStrictEqual(shared);
  expect(logger.messages).toStrictEqual([]);
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
  expect(stored.stickers.length).toBe(8);
  const metadata = present(stored.locationObservations).map(({ metadata: entry }) => entry);
  expect(metadata.map(({ status }) => status)).toStrictEqual([
    "usable",
    "usable",
    "partial",
    "partial",
    "partial",
    "partial",
    "partial",
    "partial",
  ]);
  expect(metadata[2].latitude).toBe(null);
  expect(metadata[3].longitude).toBe(null);
  expect(metadata[5].latitude).toBe(null);
  expect(metadata[5].longitude).toBe(null);
  expect(metadata[6].id).not.toBe(metadata[7].id);
  await repository.save({
    pk: "m1",
    story_locations: [
      { id: "sticker-6", location: { name: "Same", lat: 1, lng: 2 } },
      { id: "sticker-7", location: { name: "Same" } },
    ],
  });
  const promoted = present(read(new StoryRepository(database), "m1").locationObservations);
  expect(promoted[0].metadata.status).toBe("usable");
  expect(promoted[0].metadata.id).toBe(metadata[6].id);
  expect(promoted[1].metadata.status).toBe("partial");
  expect(promoted[1].metadata.id).toBe(metadata[7].id);
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
    expect(entry).toStrictEqual(byProvider.get(entry.providerOccurrenceId));
  }
  await repository.save(present(repository.findByMediaPk("m1")));
  expect(read(new StoryRepository(database), "m1")).toStrictEqual(reordered);
  await repository.save({ pk: "m1", story_locations: [] });
  const cleared = read(new StoryRepository(database), "m1");
  expect(cleared.locations).toStrictEqual(["Three"]);
  expect(present(cleared.locationObservations).length).toBe(1);
  expect(present(cleared.locationObservations)[0]).toStrictEqual(byProvider.get("c"));
  await repository.save({ pk: "m1", story_bloks_stickers: [] });
  expect(read(new StoryRepository(database), "m1").stickers).toStrictEqual([]);
  expect(read(repository, "m1").locationObservations).toBe(undefined);
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
  await expect(
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
  ).rejects.toThrow();
  const cold = new StoryRepository(database);
  expect(cold.findByMediaPk("m1")).toStrictEqual(before);
  expect(cold.findByMediaPk("m2")).toStrictEqual(partial);
  expect(cold.listByUsername("one").length).toBe(1);
  expect(cold.listByUsername("two").length).toBe(0);
  database.$client.exec("DROP TRIGGER reject_promotion");
  await repository.save({
    pk: "m2",
    story_locations: [{ id: "b", location: { pk: "place", lat: 48, lng: 2 } }],
  });
  expect(present(read(cold, "m1").locationObservations)[0].metadata.status).toBe("usable");
  expect(present(read(cold, "m1").locationObservations)[0].metadata.name).toBe("Old");
});

test("mixed labelled and ID-only locations keep valid labels and preserve earlier contributions", async (context) => {
  const { database, repository } = setup(context);
  const first = { id: "a", location: { pk: "one", name: "One", lat: 1, lng: 2 } };
  const partial = { id: "b", location: { pk: "two" } };
  await repository.save({ pk: "m1", story_locations: [first, partial] });
  const stored = read(new StoryRepository(database), "m1");
  expect(stored.locations).toStrictEqual(["One"]);
  expect(present(stored.locationObservations).length).toBe(2);
  expect(present(stored.locationObservations)[0].occurrenceId).toBe(
    stored.stickers[0].occurrenceId,
  );
  expect(present(stored.locationObservations)[1].occurrenceId).toBe(null);
  await repository.save({ pk: "m1", story_locations: [partial] });
  expect(read(repository, "m1").stickers).toStrictEqual(stored.stickers);
  // Incompleteness in one occurrence must not drop the new labelled occurrence.
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "c", location: { pk: "three", name: "Three" } }, partial],
  });
  const updated = read(new StoryRepository(database), "m1");
  expect(updated.locations).toStrictEqual(["One", "Three"]);
  expect(
    present(updated.locationObservations).find(
      ({ providerOccurrenceId }) => providerOccurrenceId === "a",
    )?.occurrenceId,
  ).toBe(stored.stickers[0].occurrenceId);
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
    expect(read(new StoryRepository(database), "m1")).toStrictEqual(before);
  }
  await repository.save({ pk: "m1", story_hashtags: [{ hashtag: "other-source" }] });
  expect(read(repository, "m1").locationObservations).toStrictEqual(before.locationObservations);
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
  expect(metadata.status).toBe("usable");
  expect(metadata.name).toBe("Updated");
  expect(metadata.address).toBe("Address");
  expect(metadata.latitude).toBe(48);
  expect(metadata.longitude).toBe(2);
  expect(metadata.facebookPlacesId).toBe("0001");
  expect(read(repository, "m1").stickers.filter(({ kind }) => kind === "location")).toStrictEqual(
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
  expect(located.length).toBe(2);
  expect(located[0].metadata.id).not.toBe(located[1].metadata.id);
  expect(located.map(({ occurrenceId }) => occurrenceId)).toStrictEqual(
    before.stickers.map(({ occurrenceId }) => occurrenceId),
  );
  await repository.save({ pk: "m1", story_locations: [{ location }, { location }] });
  const after = read(new StoryRepository(database), "m1");
  expect(after.stickers.length).toBe(2);
  for (const entry of present(after.locationObservations)) {
    expect(
      after.stickers.some(({ occurrenceId }) => occurrenceId === entry.occurrenceId),
    ).toBeTruthy();
    expect(located.every((old) => old.metadata.id !== entry.metadata.id)).toBeTruthy();
  }
});

function readPlaces(repository: StoryRepository, pk: string) {
  return present(read(repository, pk).locationObservations).map(({ metadata }) => metadata);
}

test("fill-only updates complete a partial tagged place by its Instagram place ID", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "a", location: { pk: "place" } }],
  });
  const [before] = readPlaces(repository, "m1");
  expect(before.status).toBe("partial");

  repository.fillTaggedPlace("place", {
    name: "Louvre",
    address: "Rue de Rivoli",
    latitude: 48.8606,
    longitude: 2.3376,
  });

  const [after] = readPlaces(repository, "m1");
  expect(after.status).toBe("usable");
  expect(after.id).toBe(before.id);
  expect(after.instagramPlaceId).toBe("place");
  expect(after.name).toBe("Louvre");
  expect(after.address).toBe("Rue de Rivoli");
  expect(after.latitude).toBe(48.8606);
  expect(after.longitude).toBe(2.3376);
});

test("fill-only updates never replace values the tagged place already has", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [
      {
        id: "a",
        location: {
          pk: "place",
          name: "Story name",
          address: "Story address",
          lat: 48,
          lng: 2,
        },
      },
    ],
  });
  const [before] = readPlaces(repository, "m1");

  repository.fillTaggedPlace("place", {
    name: "Other name",
    address: "Other address",
    latitude: 10,
    longitude: 20,
  });

  expect(readPlaces(repository, "m1")).toStrictEqual([before]);
});

test("fill-only updates fill only the missing fields of a partly known place", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "a", location: { pk: "place", name: "Story name", lat: 48 } }],
  });

  repository.fillTaggedPlace("place", {
    name: "Other name",
    address: "Filled address",
    latitude: 10,
    longitude: 2,
  });

  const [after] = readPlaces(repository, "m1");
  expect(after.name).toBe("Story name");
  expect(after.address).toBe("Filled address");
  expect(after.latitude).toBe(48);
  expect(after.longitude).toBe(2);
  expect(after.status).toBe("usable");
});

test("fill-only updates ignore absent, empty, and invalid incoming values", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "a", location: { pk: "place" } }],
  });
  const [before] = readPlaces(repository, "m1");

  repository.fillTaggedPlace("place", {});
  repository.fillTaggedPlace("place", {
    name: null,
    address: "   ",
    latitude: null,
    longitude: null,
  });
  repository.fillTaggedPlace("place", {
    name: "",
    latitude: 91,
    longitude: -181,
  });
  repository.fillTaggedPlace("place", {
    latitude: Number.NaN,
    longitude: Number.POSITIVE_INFINITY,
  });

  expect(readPlaces(repository, "m1")).toStrictEqual([before]);
});

test("a tagged place with only one coordinate filled stays partial", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "a", location: { pk: "place" } }],
  });

  repository.fillTaggedPlace("place", { latitude: 48 });

  const [after] = readPlaces(repository, "m1");
  expect(after.status).toBe("partial");
  expect(after.latitude).toBe(48);
  expect(after.longitude).toBe(null);
});

test("fill-only updates leave other places alone and create nothing for unknown IDs", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [
      { id: "a", location: { pk: "place" } },
      { id: "b", location: { pk: "neighbour" } },
      { id: "c", location: { facebook_places_id: "000123" } },
    ],
  });
  const before = readPlaces(repository, "m1");

  repository.fillTaggedPlace("unknown", {
    name: "Nowhere",
    latitude: 1,
    longitude: 1,
  });
  repository.fillTaggedPlace("place", { name: "Filled" });

  const after = readPlaces(repository, "m1");
  expect(after.length).toBe(3);
  expect(after[0].name).toBe("Filled");
  expect(after.slice(1)).toStrictEqual(before.slice(1));
  expect(after.map(({ instagramPlaceId }) => instagramPlaceId)).toStrictEqual([
    "place",
    "neighbour",
    null,
  ]);
});

test("story-driven merging still updates known values after a fill-only update", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "a", location: { pk: "place", name: "Story name" } }],
  });
  repository.fillTaggedPlace("place", {
    address: "Filled address",
    latitude: 1,
    longitude: 1,
  });

  await repository.save({
    pk: "m1",
    story_locations: [
      {
        id: "a",
        location: {
          pk: "place",
          name: "Newer name",
          address: "Newer address",
          lat: 2,
          lng: 3,
        },
      },
    ],
  });

  const [after] = readPlaces(repository, "m1");
  expect(after.name).toBe("Newer name");
  expect(after.address).toBe("Newer address");
  expect(after.latitude).toBe(2);
  expect(after.longitude).toBe(3);
});

test("fill-only updates reach every story that references the tagged place", async (context) => {
  const { repository } = setup(context);
  await repository.save({
    pk: "m1",
    story_locations: [{ id: "a", location: { pk: "place" } }],
  });
  await repository.save({
    pk: "m2",
    story_locations: [{ id: "b", location: { pk: "place" } }],
  });

  repository.fillTaggedPlace("place", { name: "Louvre", latitude: 48.8606, longitude: 2.3376 });

  const [first] = readPlaces(repository, "m1");
  const [second] = readPlaces(repository, "m2");
  expect(second).toStrictEqual(first);
  expect(first.status).toBe("usable");
  expect(first.name).toBe("Louvre");
  expect(first.instagramPlaceId).toBe("place");
});
