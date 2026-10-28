import assert from "node:assert/strict";
import { test } from "vitest";
import { eq } from "drizzle-orm";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { metadataLocations } from "../sdk/entities/location-metadata.ts";
import type { JsonObject, JsonValue } from "../sdk/lib/json-value.ts";
import type { StoryItem } from "../sdk/lib/types.ts";
import { backfillPlaceLookups, listPlacesToBackfill } from "../sdk/place-backfill.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { createCapturingLogger, fixedNow, response } from "./mock-helpers.ts";

const TAKEN_AT = 1_790_000_000;

function setup(context: { onTestFinished: (callback: () => void) => void }) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  return { database, repository: new StoryRepository(database) };
}

function storyAt(pk: string, placeId: string, takenAt = TAKEN_AT): StoryItem {
  return {
    pk,
    media_type: 1,
    taken_at: takenAt,
    image_versions2: { candidates: [{ url: `https://example.com/${pk}.jpg` }] },
    story_locations: [{ id: `sticker-${pk}`, location: { pk: placeId } }],
  };
}

function placeBody(id: string, category: string): JsonValue {
  const locationInfo = {
    name: `Place ${id}`,
    phone: "0102",
    category,
    media_count: 1,
    price_range: 2,
    lat: 1,
    lng: 2,
    slug: "place",
    location_id: id,
    location_address: "",
    location_city: "Amiens",
    location_zip: "80000",
  } satisfies JsonObject;
  return {
    data: {
      xdt_location_get_web_info: { native_location_data: { location_info: locationInfo } },
    },
  };
}

// Mimics the migration that dated places stored before lookups existed by their earliest story.
function dateByEarliestStory(database: ReturnType<typeof createDrizzle>, placeId: string) {
  database
    .update(metadataLocations)
    .set({ lastLookupAttemptAt: TAKEN_AT * 1000 })
    .where(eq(metadataLocations.instagramPlaceId, placeId))
    .run();
}

function createClient(categories: Record<string, string>) {
  const lookups: Array<string> = [];
  return {
    lookups,
    async getPlace(placeId: string) {
      lookups.push(placeId);
      return response(placeBody(placeId, categories[placeId] ?? "Unknown"));
    },
  };
}

const noPause = { pauseMs: 0, sleep: async () => {}, now: fixedNow };

async function seedBackfillablePlaces(context: Parameters<typeof setup>[0]) {
  const { database, repository } = setup(context);
  await repository.save(storyAt("m1", "111"));
  await repository.save(storyAt("m2", "222", TAKEN_AT + 10));
  dateByEarliestStory(database, "111");
  database
    .update(metadataLocations)
    .set({ lastLookupAttemptAt: (TAKEN_AT + 10) * 1000 })
    .where(eq(metadataLocations.instagramPlaceId, "222"))
    .run();
  return { database, repository };
}

function storedPlace(repository: StoryRepository, pk: string) {
  const observation = repository.findByMediaPk(pk)?.annotations?.locationObservations?.[0];
  assert.ok(observation);
  return observation.metadata;
}

test("places dated by the migration are looked up and gain their category and details", async (context) => {
  const { repository } = await seedBackfillablePlaces(context);
  const client = createClient({ "111": "Bistro", "222": "Pont" });
  const count = await backfillPlaceLookups(client, repository, createCapturingLogger(), noPause);
  assert.equal(count, 2);
  assert.deepEqual(client.lookups.toSorted(), ["111", "222"]);
  assert.equal(storedPlace(repository, "m1").category, "Bistro");
  assert.deepEqual(repository.findByMediaPk("m1")?.annotations?.locations, ["Place 111"]);
  assert.equal(storedPlace(repository, "m2").category, "Pont");
  assert.equal(repository.findPlaceDetails("111")?.phone, "0102");
  assert.equal(storedPlace(repository, "m1").lastLookupAttemptAt, fixedNow().getTime());
});

test("a place that was really looked up, or has a non-numeric id, is not backfilled", async (context) => {
  const { database, repository } = setup(context);
  await repository.save(storyAt("m1", "111"));
  await repository.save(storyAt("m2", "bloks_sticker_id"));
  dateByEarliestStory(database, "bloks_sticker_id");
  database
    .update(metadataLocations)
    .set({ lastLookupAttemptAt: TAKEN_AT * 1000 + 969 })
    .where(eq(metadataLocations.instagramPlaceId, "111"))
    .run();
  assert.deepEqual(listPlacesToBackfill(repository), []);
});

test("the limit bounds how many places are looked up and the others stay untouched", async (context) => {
  const { repository } = await seedBackfillablePlaces(context);
  const client = createClient({ "111": "Bistro", "222": "Pont" });
  const count = await backfillPlaceLookups(client, repository, createCapturingLogger(), {
    ...noPause,
    limit: 1,
  });
  assert.equal(count, 1);
  assert.equal(client.lookups.length, 1);
  assert.equal(listPlacesToBackfill(repository).length, 1);
});

test("a backfilled place is no longer listed, so the backfill can be rerun", async (context) => {
  const { repository } = await seedBackfillablePlaces(context);
  assert.equal(listPlacesToBackfill(repository).length, 2);
  await backfillPlaceLookups(createClient({}), repository, createCapturingLogger(), noPause);
  assert.deepEqual(listPlacesToBackfill(repository), []);
});

test("the backfill pauses between lookups but not before the first", async (context) => {
  const { repository } = await seedBackfillablePlaces(context);
  const pauses: Array<number> = [];
  await backfillPlaceLookups(createClient({}), repository, createCapturingLogger(), {
    ...noPause,
    pauseMs: 750,
    sleep: async (milliseconds) => {
      pauses.push(milliseconds);
    },
  });
  assert.deepEqual(pauses, [750]);
});

test("nothing is requested when no place is left to backfill", async (context) => {
  const { repository } = setup(context);
  const client = createClient({});
  const count = await backfillPlaceLookups(client, repository, createCapturingLogger(), noPause);
  assert.equal(count, 0);
  assert.deepEqual(client.lookups, []);
});

test("a client that cannot look places up backfills nothing and keeps the dated attempts", async (context) => {
  const { repository } = await seedBackfillablePlaces(context);
  const count = await backfillPlaceLookups({}, repository, createCapturingLogger(), noPause);
  assert.equal(count, 0);
  assert.equal(listPlacesToBackfill(repository).length, 2);
});

test("a place is dated by its earliest story and looked up from that story", async (context) => {
  const { database, repository } = setup(context);
  await repository.save(storyAt("later", "111", TAKEN_AT + 10));
  await repository.save(storyAt("earlier", "111"));
  dateByEarliestStory(database, "111");
  assert.deepEqual(listPlacesToBackfill(repository), [
    { instagramPlaceId: "111", mediaPk: "earlier" },
  ]);
});

test("a story without a publication time never dates a place", async (context) => {
  const { database, repository } = setup(context);
  await repository.save({ ...storyAt("m1", "111"), taken_at: undefined });
  database
    .update(metadataLocations)
    .set({ lastLookupAttemptAt: TAKEN_AT * 1000 })
    .where(eq(metadataLocations.instagramPlaceId, "111"))
    .run();
  assert.deepEqual(listPlacesToBackfill(repository), []);
});
