import assert from "node:assert/strict";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import type { JsonObject, JsonValue } from "../sdk/lib/json-value.ts";
import type { StoryItem } from "../sdk/lib/types.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  noSleep,
  reel,
  response,
} from "./mock-helpers.ts";

const owner = { username: "one", pk: "owner" };

function setup(context: { onTestFinished: (callback: () => void) => void }) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  return new StoryRepository(database);
}

function placeBody(
  id: string,
  info: { name?: string; address?: string; lat?: number; lng?: number },
): JsonValue {
  return {
    data: {
      xdt_location_get_web_info: {
        native_location_data: {
          location_info: {
            name: info.name ?? "",
            phone: "",
            category: "Bistro",
            media_count: 12,
            price_range: 0,
            lat: info.lat ?? null,
            lng: info.lng ?? null,
            slug: "place",
            location_id: id,
            location_address: info.address ?? "",
            location_city: "",
            location_zip: "",
          },
        },
      },
    },
  };
}

function storyAt(pk: string, place: JsonObject): StoryItem {
  return {
    pk,
    media_type: 1,
    taken_at: 1_790_000_000,
    image_versions2: { candidates: [{ url: `https://example.com/${pk}.jpg` }] },
    story_locations: [{ id: `sticker-${pk}`, location: place }],
  };
}

// The double of the app's own Instagram client: canned lookup responses by place id.
function createPlaceClient(
  stories: Array<StoryItem>,
  places: Partial<Record<string, () => ReturnType<typeof response<JsonValue>>>>,
) {
  const client = createClient(
    [{ id: "reel", media_ids: stories.map(({ pk }) => pk), user: owner }],
    [response({ reels: { reel: { ...reel("reel", stories), user: owner } } })],
  );
  const lookups: Array<string> = [];
  return Object.assign(client, {
    lookups,
    async getPlace(placeId: string) {
      lookups.push(placeId);
      const canned = places[placeId];
      if (canned === undefined) {
        throw new Error(`Unexpected place lookup ${placeId}`);
      }
      return canned();
    },
  });
}

async function ingest(repository: StoryRepository, client: ReturnType<typeof createPlaceClient>) {
  return await fetchStoriesManifest(client, {
    storyRepository: repository,
    storyStorage: createMemoryStorage(),
    logger: createCapturingLogger(),
    now: fixedNow,
    sleep: noSleep,
  });
}

function storedPlace(repository: StoryRepository, pk: string) {
  const observation = repository.findByMediaPk(pk)?.annotations?.locationObservations?.[0];
  assert.ok(observation);
  return observation.metadata;
}

test("a place that stories only identify by its id becomes usable after a lookup", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "633725939834688" })], {
    "633725939834688": () =>
      response(
        placeBody("633725939834688", {
          name: "V and B Amiens Les Halles",
          address: "1 Rue des Halles",
          lat: 49.8943,
          lng: 2.2957,
        }),
      ),
  });
  await ingest(repository, client);
  const place = storedPlace(repository, "m1");
  assert.equal(place.status, "usable");
  assert.equal(place.name, "V and B Amiens Les Halles");
  assert.equal(place.address, "1 Rue des Halles");
  assert.equal(place.latitude, 49.8943);
  assert.equal(place.longitude, 2.2957);
  assert.equal(place.instagramPlaceId, "633725939834688");
  assert.equal(place.lastLookupAttemptAt, fixedNow().getTime());
  assert.deepEqual(client.lookups, ["633725939834688"]);
});

test("story values are never overwritten and only gaps are filled", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient(
    [storyAt("m1", { pk: "111", name: "Story name", lat: 10, lng: 20 })],
    {
      "111": () =>
        response(placeBody("111", { name: "Instagram name", address: "Filled", lat: 11, lng: 21 })),
    },
  );
  await ingest(repository, client);
  const place = storedPlace(repository, "m1");
  assert.equal(place.name, "Story name");
  assert.equal(place.latitude, 10);
  assert.equal(place.longitude, 20);
  assert.equal(place.address, "Filled");
  assert.equal(place.lastLookupAttemptAt, fixedNow().getTime());
});

test("only places referenced by the stories saved in the run are looked up", async (context) => {
  const repository = setup(context);
  await repository.save(storyAt("old", { pk: "222" }));
  const client = createPlaceClient([storyAt("m1", { pk: "111" })], {
    "111": () => response(placeBody("111", { name: "Fresh", lat: 1, lng: 2 })),
  });
  await ingest(repository, client);
  assert.deepEqual(client.lookups, ["111"]);
  assert.equal(storedPlace(repository, "old").lastLookupAttemptAt, null);
  assert.equal(storedPlace(repository, "old").name, null);
});

test("a place that was already looked up is not looked up again", async (context) => {
  const repository = setup(context);
  const first = createPlaceClient([storyAt("m1", { pk: "111" })], {
    "111": () => response(placeBody("111", { name: "Fresh", lat: 1, lng: 2 })),
  });
  await ingest(repository, first);
  const second = createPlaceClient([storyAt("m2", { pk: "111" })], {});
  await ingest(repository, second);
  assert.deepEqual(second.lookups, []);
  assert.equal(storedPlace(repository, "m2").lastLookupAttemptAt, fixedNow().getTime());
});

test("a place with a non-numeric id is skipped without a request or a failure", async (context) => {
  const repository = setup(context);
  const logger = createCapturingLogger();
  const client = createPlaceClient(
    [storyAt("m1", { pk: "bloks_sticker_id", name: "Sticker" })],
    {},
  );
  await fetchStoriesManifest(client, {
    storyRepository: repository,
    storyStorage: createMemoryStorage(),
    logger,
    now: fixedNow,
    sleep: noSleep,
  });
  assert.deepEqual(client.lookups, []);
  assert.equal(storedPlace(repository, "m1").lastLookupAttemptAt, null);
  assert.deepEqual(
    logger.messages.filter(
      (message) =>
        message.startsWith("warn") || message.startsWith("error") || message.includes("place"),
    ),
    [],
  );
});

test("an unusable lookup applies no values and the story is kept", async (context) => {
  const repository = setup(context);
  const unusable = {
    "1": () =>
      response({
        data: { xdt_location_get_web_info: { native_location_data: { location_info: null } } },
      }),
    "2": () => response({ errors: [{ message: "field_exception" }], data: null }),
    "3": () => response(placeBody("999", { name: "Other place", lat: 1, lng: 2 })),
    "4": () => ({
      ...response<JsonValue>(null),
      json: () => {
        throw new Error("Instagram returned text/html");
      },
    }),
    "5": () => response(placeBody("5", { name: "Rejected" }), 500),
  } satisfies Record<string, () => ReturnType<typeof response<JsonValue>>>;
  const stories = Object.keys(unusable).map((pk) => storyAt(`m${pk}`, { pk }));
  await ingest(repository, createPlaceClient(stories, unusable));
  for (const pk of Object.keys(unusable)) {
    const place = storedPlace(repository, `m${pk}`);
    assert.equal(place.status, "partial");
    assert.equal(place.name, null);
    assert.equal(place.lastLookupAttemptAt, null);
  }
});

test("a thrown lookup never blocks the story or the lookups after it", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "1" }), storyAt("m2", { pk: "2" })], {
    "2": () => response(placeBody("2", { name: "Second", lat: 1, lng: 2 })),
  });
  const report = await ingest(repository, client);
  assert.equal(report.metadata.counts.fetched, 2);
  assert.notEqual(repository.findByMediaPk("m1"), null);
  assert.equal(storedPlace(repository, "m1").lastLookupAttemptAt, null);
  assert.equal(storedPlace(repository, "m2").name, "Second");
});

test("a blocked session stops the remaining lookups and records nothing", async (context) => {
  for (const status of [401, 403, 429]) {
    const repository = setup(context);
    const client = createPlaceClient([storyAt("m1", { pk: "1" }), storyAt("m2", { pk: "2" })], {
      "1": () => response(placeBody("1", { name: "Blocked" }), status),
    });
    // oxlint-disable-next-line no-await-in-loop -- Each status uses its own database.
    await ingest(repository, client);
    assert.deepEqual(client.lookups, ["1"]);
    assert.equal(storedPlace(repository, "m1").lastLookupAttemptAt, null);
    assert.equal(storedPlace(repository, "m2").lastLookupAttemptAt, null);
  }
});

test("a later story observation keeps the recorded lookup", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Looked up", lat: 1, lng: 2 })),
    }),
  );
  await repository.save(storyAt("m1", { pk: "111", name: "From story" }));
  const place = storedPlace(repository, "m1");
  assert.equal(place.lastLookupAttemptAt, fixedNow().getTime());
  assert.equal(place.name, "From story");
});
