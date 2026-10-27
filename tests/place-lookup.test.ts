import assert from "node:assert/strict";
import { test } from "vitest";
import { eq } from "drizzle-orm";
import { createDrizzle } from "../sdk/database/client.ts";
import {
  metadataLocationDetails,
  metadataLocations,
  storyLocationObservations,
} from "../sdk/entities/location-metadata.ts";
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

function setupDatabase(context: { onTestFinished: (callback: () => void) => void }) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  return database;
}

function setup(context: { onTestFinished: (callback: () => void) => void }) {
  return new StoryRepository(setupDatabase(context));
}

interface PlaceBodyInfo {
  name?: string;
  address?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  category?: string;
  phone?: string;
  priceRange?: number;
  slug?: string;
  business?: JsonValue;
}

function placeBody(id: string, info: PlaceBodyInfo): JsonValue {
  const locationInfo = {
    name: info.name ?? "",
    phone: info.phone ?? "",
    category: info.category ?? "Bistro",
    media_count: 12,
    price_range: info.priceRange ?? 0,
    lat: info.lat ?? null,
    lng: info.lng ?? null,
    slug: info.slug ?? "place",
    location_id: id,
    location_address: info.address ?? "",
    location_city: info.city ?? "",
    location_zip: info.zip ?? "",
  } satisfies JsonObject;
  const withBusiness =
    info.business === undefined ? locationInfo : { ...locationInfo, ig_business: info.business };
  return {
    data: { xdt_location_get_web_info: { native_location_data: { location_info: withBusiness } } },
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

async function ingest(
  repository: StoryRepository,
  client: ReturnType<typeof createPlaceClient>,
  now: () => Date = fixedNow,
) {
  return await fetchStoriesManifest(client, {
    storyRepository: repository,
    storyStorage: createMemoryStorage(),
    logger: createCapturingLogger(),
    now,
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

test("the category Instagram returns is stored exactly as received", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111" })], {
    "111": () => response(placeBody("111", { name: "Chez Paul", category: "Bistrot de quartier" })),
  });
  await ingest(repository, client);
  assert.equal(storedPlace(repository, "m1").category, "Bistrot de quartier");
});

test("an empty category from Instagram is stored as a missing category", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111" }), storyAt("m2", { pk: "222" })], {
    "111": () => response(placeBody("111", { name: "Empty", category: "" })),
    "222": () => response(placeBody("222", { name: "Blank", category: "   " })),
  });
  await ingest(repository, client);
  assert.equal(storedPlace(repository, "m1").category, null);
  assert.equal(storedPlace(repository, "m2").category, null);
});

test("a category never decides whether a place is usable", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111" }), storyAt("m2", { pk: "222" })], {
    "111": () => response(placeBody("111", { name: "No coordinates", category: "Pont" })),
    "222": () => response(placeBody("222", { name: "No category", category: "", lat: 1, lng: 2 })),
  });
  await ingest(repository, client);
  assert.equal(storedPlace(repository, "m1").status, "partial");
  assert.equal(storedPlace(repository, "m1").category, "Pont");
  assert.equal(storedPlace(repository, "m2").status, "usable");
});

test("a lookup supplies the zip code and fills a missing city", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111" })], {
    "111": () => response(placeBody("111", { name: "Chez Paul", city: "Amiens", zip: "80000" })),
  });
  await ingest(repository, client);
  const place = storedPlace(repository, "m1");
  assert.equal(place.city, "Amiens");
  assert.equal(place.zip, "80000");
});

test("a city from a story is stored and never overwritten by a lookup", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111", city: "Story City" })], {
    "111": () =>
      response(placeBody("111", { name: "Chez Paul", city: "Instagram City", zip: "75001" })),
  });
  await ingest(repository, client);
  const place = storedPlace(repository, "m1");
  assert.equal(place.city, "Story City");
  assert.equal(place.zip, "75001");
});

test("empty strings are stored as a missing city and a missing zip code", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient(
    [storyAt("m1", { pk: "111", city: "" }), storyAt("m2", { pk: "222", city: "   " })],
    {
      "111": () => response(placeBody("111", { name: "Empty", city: "", zip: "" })),
      "222": () => response(placeBody("222", { name: "Blank", city: "  ", zip: "  " })),
    },
  );
  await ingest(repository, client);
  for (const pk of ["m1", "m2"]) {
    assert.equal(storedPlace(repository, pk).city, null);
    assert.equal(storedPlace(repository, pk).zip, null);
  }
});

test("a blank city from a story leaves the gap for the lookup to fill", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111", city: "" })], {
    "111": () => response(placeBody("111", { name: "Chez Paul", city: "Amiens" })),
  });
  await ingest(repository, client);
  assert.equal(storedPlace(repository, "m1").city, "Amiens");
});

test("a story never supplies the zip code", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111", zip: "99999" })], {
    "111": () => response(placeBody("111", { name: "Chez Paul", zip: "" })),
  });
  await ingest(repository, client);
  assert.equal(storedPlace(repository, "m1").zip, null);
});

test("a city and a zip code never decide whether a place is usable", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111" }), storyAt("m2", { pk: "222" })], {
    "111": () =>
      response(placeBody("111", { name: "No coordinates", city: "Amiens", zip: "80000" })),
    "222": () => response(placeBody("222", { name: "No city", lat: 1, lng: 2 })),
  });
  await ingest(repository, client);
  assert.equal(storedPlace(repository, "m1").status, "partial");
  assert.equal(storedPlace(repository, "m2").status, "usable");
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

test("each kind of unusable lookup applies no values, keeps the story and is recorded as failed", async (context) => {
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
    "6": () => response({ data: { unexpected: true } }),
  } satisfies Record<string, () => ReturnType<typeof response<JsonValue>>>;
  const stories = Object.keys(unusable).map((pk) => storyAt(`m${pk}`, { pk }));
  await ingest(repository, createPlaceClient(stories, unusable));
  const failures: Record<string, string | null> = {};
  for (const pk of Object.keys(unusable)) {
    const place = storedPlace(repository, `m${pk}`);
    assert.equal(place.status, "partial");
    assert.equal(place.name, null);
    assert.equal(place.lastLookupAttemptAt, fixedNow().getTime());
    failures[pk] = place.lastLookupFailure;
  }
  assert.match(failures["1"] ?? "", /no place data/iu);
  assert.match(failures["2"] ?? "", /field_exception/u);
  assert.match(failures["3"] ?? "", /no place data/iu);
  assert.equal(failures["4"], "Instagram returned text/html");
  assert.match(failures["5"] ?? "", /500/u);
  assert.match(failures["6"] ?? "", /invalid/iu);
});

test("a thrown lookup never blocks the story or the lookups after it", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "1" }), storyAt("m2", { pk: "2" })], {
    "1": () => {
      throw new Error("socket hang up");
    },
    "2": () => response(placeBody("2", { name: "Second", lat: 1, lng: 2 })),
  });
  const report = await ingest(repository, client);
  assert.equal(report.metadata.counts.fetched, 2);
  assert.notEqual(repository.findByMediaPk("m1"), null);
  assert.equal(storedPlace(repository, "m2").name, "Second");
  assert.deepEqual(client.lookups, ["1", "2"]);
});

test("a thrown lookup is recorded with its attempt time and raw error", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "1", name: "Known", lat: 1, lng: 2 })], {
    "1": () => {
      throw new Error("socket hang up");
    },
  });
  await ingest(repository, client);
  const place = storedPlace(repository, "m1");
  assert.equal(place.lastLookupAttemptAt, fixedNow().getTime());
  assert.equal(place.lastLookupFailure, "socket hang up");
  assert.equal(place.name, "Known");
  assert.equal(place.status, "usable");
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
    assert.equal(storedPlace(repository, "m1").lastLookupFailure, null);
    assert.equal(storedPlace(repository, "m2").lastLookupAttemptAt, null);
  }
});

const HOUR = 60 * 60 * 1000;

function laterBy(milliseconds: number) {
  return () => new Date(fixedNow().getTime() + milliseconds);
}

test("a place whose last lookup failed is looked up again only after twelve hours", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Chez Paul" }), 500),
    }),
  );
  const tooSoon = createPlaceClient([storyAt("m2", { pk: "111" })], {});
  await ingest(repository, tooSoon, laterBy(12 * HOUR - 1));
  assert.deepEqual(tooSoon.lookups, []);
  assert.equal(storedPlace(repository, "m2").lastLookupAttemptAt, fixedNow().getTime());

  const retried = createPlaceClient([storyAt("m3", { pk: "111" })], {
    "111": () => response(placeBody("111", { name: "Chez Paul", lat: 1, lng: 2 })),
  });
  await ingest(repository, retried, laterBy(12 * HOUR));
  assert.deepEqual(retried.lookups, ["111"]);
  const place = storedPlace(repository, "m3");
  assert.equal(place.name, "Chez Paul");
  assert.equal(place.lastLookupAttemptAt, fixedNow().getTime() + 12 * HOUR);
});

test("a recorded failure is bounded and never holds request headers, cookies or tokens", async (context) => {
  const repository = setup(context);
  const leaking = Object.assign(new Error("x".repeat(5000)), {
    headers: { cookie: "sessionid=secret-session" },
    request: { headers: { "x-csrftoken": "secret-token" } },
    cause: new Error("sessionid=secret-session"),
  });
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => {
        throw leaking;
      },
    }),
  );
  const failure = storedPlace(repository, "m1").lastLookupFailure;
  assert.equal(failure, "x".repeat(2000));
  assert.doesNotMatch(failure, /secret/u);
});

test("a failure that cannot be recorded never blocks the story or the lookups after it", async (context) => {
  const repository = setup(context);
  repository.recordFailedPlaceLookup = () => {
    throw new Error("database is locked");
  };
  const client = createPlaceClient([storyAt("m1", { pk: "1" }), storyAt("m2", { pk: "2" })], {
    "1": () => {
      throw new Error("socket hang up");
    },
    "2": () => response(placeBody("2", { name: "Second" })),
  });
  const report = await ingest(repository, client);
  assert.equal(report.metadata.counts.fetched, 2);
  assert.deepEqual(client.lookups, ["1", "2"]);
  assert.equal(storedPlace(repository, "m2").name, "Second");
});

test("a later successful lookup clears the stored failure", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => {
        throw new Error("socket hang up");
      },
    }),
  );
  assert.equal(storedPlace(repository, "m1").lastLookupFailure, "socket hang up");
  await ingest(
    repository,
    createPlaceClient([storyAt("m2", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Chez Paul" })),
    }),
    laterBy(12 * HOUR),
  );
  assert.equal(storedPlace(repository, "m2").lastLookupFailure, null);
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
  assert.equal(place.category, "Bistro");
  assert.equal(place.name, "From story");
});

test("a later story observation keeps the looked-up zip code and a story city replaces a looked-up one", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Looked up", city: "Amiens", zip: "80000" })),
    }),
  );
  assert.equal(storedPlace(repository, "m1").city, "Amiens");
  await repository.save(storyAt("m1", { pk: "111", city: "Story City" }));
  const place = storedPlace(repository, "m1");
  assert.equal(place.city, "Story City");
  assert.equal(place.zip, "80000");
});

test("the phone, price range, slug and business account of a place are stored", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111" })], {
    "111": () =>
      response(
        placeBody("111", {
          name: "Chez Paul",
          phone: "+33 1 23 45 67 89",
          priceRange: 2,
          slug: "chez-paul",
          business: {
            profile: {
              id: "17841400000000001",
              username: "chezpaul",
              profile_pic_url: "https://example.com/chezpaul.jpg",
            },
          },
        }),
      ),
  });
  await ingest(repository, client);
  assert.deepEqual(repository.findPlaceDetails("111"), {
    phone: "+33 1 23 45 67 89",
    priceRange: 2,
    slug: "chez-paul",
    businessAccountId: "17841400000000001",
    businessAccountUsername: "chezpaul",
    businessAccountPictureUrl: "https://example.com/chezpaul.jpg",
  });
});

test("a place without a linked business account has no business information", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient(
    [storyAt("m1", { pk: "111" }), storyAt("m2", { pk: "222" }), storyAt("m3", { pk: "333" })],
    {
      "111": () =>
        response(placeBody("111", { phone: "0102", priceRange: 1, business: { profile: null } })),
      "222": () => response(placeBody("222", { phone: "0304" })),
      "333": () => response(placeBody("333", { phone: "0506", business: null })),
    },
  );
  await ingest(repository, client);
  for (const [id, phone] of [
    ["111", "0102"],
    ["222", "0304"],
    ["333", "0506"],
  ]) {
    const details = repository.findPlaceDetails(id);
    assert.ok(details);
    assert.equal(details.phone, phone);
    assert.equal(details.businessAccountId, null);
    assert.equal(details.businessAccountUsername, null);
    assert.equal(details.businessAccountPictureUrl, null);
  }
});

test("empty strings from Instagram are stored as missing details", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "111" })], {
    "111": () =>
      response(
        placeBody("111", {
          phone: "",
          slug: "  ",
          business: { profile: { id: "17841", username: "", profile_pic_url: "" } },
        }),
      ),
  });
  await ingest(repository, client);
  assert.deepEqual(repository.findPlaceDetails("111"), {
    phone: null,
    priceRange: 0,
    slug: null,
    businessAccountId: "17841",
    businessAccountUsername: null,
    businessAccountPictureUrl: null,
  });
});

test("an unusable lookup stores no details", async (context) => {
  const repository = setup(context);
  const client = createPlaceClient([storyAt("m1", { pk: "5" })], {
    "5": () => response(placeBody("5", { phone: "0102" }), 500),
  });
  await ingest(repository, client);
  assert.equal(repository.findPlaceDetails("5"), null);
});

test("a later lookup replaces the stored details and clears a business account that is gone", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () =>
        response(
          placeBody("111", {
            phone: "0102",
            priceRange: 3,
            business: { profile: { id: "1", username: "old", profile_pic_url: "https://x/a.jpg" } },
          }),
        ),
    }),
  );
  repository.recordPlaceLookup(
    "111",
    { details: { phone: "", priceRange: 1, slug: "new-slug", business: null } },
    fixedNow(),
  );
  assert.deepEqual(repository.findPlaceDetails("111"), {
    phone: null,
    priceRange: 1,
    slug: "new-slug",
    businessAccountId: null,
    businessAccountUsername: null,
    businessAccountPictureUrl: null,
  });
});

test("the details of a place are deleted with the place", async (context) => {
  const database = setupDatabase(context);
  const repository = new StoryRepository(database);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { phone: "0102" })),
    }),
  );
  assert.equal(database.select().from(metadataLocationDetails).all().length, 1);
  database.delete(storyLocationObservations).run();
  database.delete(metadataLocations).where(eq(metadataLocations.instagramPlaceId, "111")).run();
  assert.equal(database.select().from(metadataLocationDetails).all().length, 0);
});

test("a malformed detail never blocks the place fill and keeps the earlier details", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { phone: "0102", priceRange: 2 })),
    }),
  );
  const malformed = createPlaceClient([storyAt("m2", { pk: "222" })], {
    "222": () => response(placeBody("222", { name: "Chez Paul", lat: 1, lng: 2, priceRange: 2.5 })),
  });
  await ingest(repository, malformed);
  const place = storedPlace(repository, "m2");
  assert.equal(place.name, "Chez Paul");
  assert.equal(place.status, "usable");
  assert.equal(place.lastLookupAttemptAt, fixedNow().getTime());
  assert.equal(repository.findPlaceDetails("222"), null);
  assert.equal(repository.findPlaceDetails("111")?.phone, "0102");
});

function locationStickers(repository: StoryRepository, pk: string) {
  return (
    repository.findByMediaPk(pk)?.annotations?.stickers.filter(({ kind }) => kind === "location") ??
    []
  );
}

function shownLocations(repository: StoryRepository, pk: string) {
  return repository.findByMediaPk(pk)?.annotations?.locations;
}

test("a place named by a lookup becomes the location sticker of a story that only had its id", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () =>
        response(
          placeBody("111", { name: "Chez Paul", address: "1 Rue des Halles", lat: 1, lng: 2 }),
        ),
    }),
  );
  assert.deepEqual(shownLocations(repository, "m1"), ["Chez Paul, 1 Rue des Halles"]);
  const [sticker] = locationStickers(repository, "m1");
  assert.equal(sticker.source, "story_locations");
  assert.equal(storedPlace(repository, "m1").name, "Chez Paul");
  const observation = repository.findByMediaPk("m1")?.annotations?.locationObservations?.[0];
  assert.equal(observation?.occurrenceId, sticker.occurrenceId);
});

test("a name without an address is the whole label", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Chez Paul" })),
    }),
  );
  assert.deepEqual(shownLocations(repository, "m1"), ["Chez Paul"]);
});

test("every story of the run that references the place gets the location sticker", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" }), storyAt("m2", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Chez Paul" })),
    }),
  );
  assert.deepEqual(shownLocations(repository, "m1"), ["Chez Paul"]);
  assert.deepEqual(shownLocations(repository, "m2"), ["Chez Paul"]);
});

test("a story that already shows the place keeps its single location sticker", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111", name: "Story name" })], {
      "111": () => response(placeBody("111", { name: "Instagram name", address: "Filled" })),
    }),
  );
  assert.deepEqual(shownLocations(repository, "m1"), ["Story name"]);
  assert.equal(locationStickers(repository, "m1").length, 1);
});

test("a lookup that names nothing or fails adds no location sticker", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "1" }), storyAt("m2", { pk: "2" })], {
      "1": () => response(placeBody("1", { lat: 1, lng: 2 })),
      "2": () => response(placeBody("2", { name: "Rejected" }), 500),
    }),
  );
  assert.deepEqual(locationStickers(repository, "m1"), []);
  assert.deepEqual(locationStickers(repository, "m2"), []);
});

test("a later save of the story keeps the location sticker made by a lookup", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Chez Paul" })),
    }),
  );
  await repository.save(storyAt("m1", { pk: "111" }));
  assert.deepEqual(shownLocations(repository, "m1"), ["Chez Paul"]);
  assert.equal(locationStickers(repository, "m1").length, 1);
});

test("a later lookup of the same place never adds a second location sticker", async (context) => {
  const repository = setup(context);
  await ingest(
    repository,
    createPlaceClient([storyAt("m1", { pk: "111" })], {
      "111": () => response(placeBody("111", { name: "Chez Paul" })),
    }),
  );
  repository.recordPlaceLookup("111", { name: "Chez Paul", address: "Later address" }, fixedNow());
  assert.equal(locationStickers(repository, "m1").length, 1);
  assert.deepEqual(shownLocations(repository, "m1"), ["Chez Paul"]);
});

test("a story that tags the same place twice gets a single location sticker", async (context) => {
  const repository = setup(context);
  const story: StoryItem = {
    ...storyAt("m1", { pk: "111" }),
    story_locations: [
      { id: "sticker-a", location: { pk: "111" } },
      { id: "sticker-b", location: { pk: "111" } },
    ],
  };
  await ingest(
    repository,
    createPlaceClient([story], {
      "111": () => response(placeBody("111", { name: "Chez Paul" })),
    }),
  );
  assert.equal(locationStickers(repository, "m1").length, 1);
  assert.deepEqual(shownLocations(repository, "m1"), ["Chez Paul"]);
});

test("a lookup recorded for an unknown place changes nothing", async (context) => {
  const repository = setup(context);
  await repository.save(storyAt("m1", { pk: "111" }));
  repository.recordPlaceLookup(
    "999",
    { name: "Nobody", details: { phone: "0102", priceRange: 1 } },
    fixedNow(),
  );
  assert.deepEqual(locationStickers(repository, "m1"), []);
  assert.equal(repository.findPlaceDetails("999"), null);
  assert.equal(storedPlace(repository, "m1").name, null);
});

test("a story that tags two places gets one location sticker per place, in lookup order", async (context) => {
  const repository = setup(context);
  const story: StoryItem = {
    ...storyAt("m1", { pk: "111" }),
    story_locations: [
      { id: "sticker-a", location: { pk: "111" } },
      { id: "sticker-b", location: { pk: "222" } },
    ],
  };
  await ingest(
    repository,
    createPlaceClient([story], {
      "111": () => response(placeBody("111", { name: "First place" })),
      "222": () => response(placeBody("222", { name: "Second place" })),
    }),
  );
  assert.deepEqual(shownLocations(repository, "m1"), ["First place", "Second place"]);
});
