import { assert, expect, test } from "vitest";
import type { StoryItem } from "../sdk/instagram-types.ts";
import type { DrizzleDatabase } from "../sdk/database/client.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { createTestDatabase } from "./test-database.ts";

const owner = { id: "u1", pk: "u1", username: "one", full_name: "One" };
const other = { id: "u2", pk: "u2", username: "two", full_name: "Two" };

type User = typeof owner;

interface RollbackScenario {
  name: string;
  /** Users behind the first saved story, the failing save and the retry; absent when the scenario has no users. */
  owners?: { saved: User; failing: User; retry?: User };
  /** Stories saved before the failure. */
  saved: Array<StoryItem>;
  /** A temporary trigger that makes one of the save's writes fail. */
  trigger: { name: string; on: string; when?: string };
  /** The save that fails. */
  failing: StoryItem;
  /** The save that succeeds once the trigger is gone. */
  retry: StoryItem;
  verifyRetry: (
    cold: StoryRepository,
    database: DrizzleDatabase,
    before: Array<StoryItem | null>,
  ) => void;
}

function annotationsOf(repository: StoryRepository, pk: string) {
  const annotations = repository.findByMediaPk(pk)?.annotations;
  assert.ok(annotations);
  return annotations;
}

function firstOf<T>(items: Array<T> | undefined): T {
  const item = items?.[0];
  assert.ok(item !== undefined, "expected an observation");
  return item;
}

const oldImage = { candidates: [{ url: "https://example.com/old.jpg" }] };
const newImage = { candidates: [{ url: "https://example.com/new.jpg" }] };
const promotedMusic: StoryItem = {
  pk: "m1",
  taken_at: 1_767_225_601,
  media_type: 2,
  image_versions2: newImage,
  story_music_stickers: [
    { id: "a", music_asset_info: { audio_asset_id: "audio", display_artist: "Artist" } },
  ],
};

const scenarios: Array<RollbackScenario> = [
  {
    name: "location promotion",
    owners: { saved: owner, failing: other },
    saved: [
      {
        pk: "m1",
        taken_at: 1_767_225_600,
        media_type: 1,
        image_versions2: oldImage,
        story_locations: [{ id: "a", location: { pk: "place", name: "Old" } }],
      },
      { pk: "m2", story_locations: [{ id: "b", location: { pk: "place" } }] },
    ],
    trigger: {
      name: "reject_promotion",
      on: "BEFORE UPDATE ON story_location_observations",
      when: "NEW.locationId IS NOT NULL",
    },
    failing: {
      pk: "m1",
      taken_at: 1_767_225_601,
      media_type: 2,
      image_versions2: newImage,
      story_locations: [{ id: "a", location: { pk: "place", name: "New", lat: 48, lng: 2 } }],
    },
    retry: { pk: "m2", story_locations: [{ id: "b", location: { pk: "place", lat: 48, lng: 2 } }] },
    verifyRetry: (cold) => {
      const observation = firstOf(annotationsOf(cold, "m1").locationObservations);
      expect(observation.metadata).toMatchObject({ status: "usable", name: "Old" });
    },
  },
  {
    name: "music metadata update",
    owners: { saved: owner, failing: other, retry: other },
    saved: [
      {
        pk: "m1",
        taken_at: 1_767_225_600,
        media_type: 1,
        image_versions2: oldImage,
        story_music_stickers: [
          { id: "a", music_asset_info: { audio_asset_id: "audio", title: "Song" } },
        ],
      },
      {
        pk: "m2",
        story_music_stickers: [{ id: "b", music_asset_info: { audio_asset_id: "audio" } }],
      },
    ],
    trigger: { name: "reject_music_update", on: "BEFORE UPDATE ON metadata_music" },
    failing: promotedMusic,
    retry: promotedMusic,
    verifyRetry: (cold, database, [before]) => {
      const first = firstOf(annotationsOf(cold, "m1").musicObservations);
      const second = firstOf(annotationsOf(cold, "m2").musicObservations);
      expect(first.metadata).toMatchObject({ status: "usable", title: "Song", artist: "Artist" });
      expect(first.metadata).toStrictEqual(second.metadata);
      expect(first.occurrenceId).toBe(before?.annotations?.stickers[0].occurrenceId);
      expect(cold.listByUsername("two")).toHaveLength(1);
      expect(database.$client.prepare("SELECT count(*) n FROM metadata_music").get()?.n).toBe(1);
    },
  },
  {
    name: "annotation replacement",
    saved: [
      {
        pk: "m1",
        story_hashtags: [{ hashtag: "old" }],
        story_locations: [],
        story_music_stickers: [{ music_asset_info: { title: "Old" } }],
      },
    ],
    trigger: {
      name: "reject_annotation",
      on: "BEFORE INSERT ON story_stickers",
      when: "NEW.label = '#fail'",
    },
    failing: { pk: "m1", story_hashtags: [{ hashtag: "fail" }], story_music_stickers: [] },
    retry: { pk: "m1", story_hashtags: [{ hashtag: "ok" }], story_music_stickers: [] },
    verifyRetry: (cold) => {
      expect(annotationsOf(cold, "m1").stickers.map(({ label }) => label)).toEqual(["#ok"]);
    },
  },
];

test.for(scenarios)(
  "a failed $name leaves every stored value untouched, and the save works once the failure is gone",
  async (scenario, context) => {
    const database = createTestDatabase(context);
    const repository = new StoryRepository(database);
    const { owners, trigger } = scenario;
    if (owners) {
      const users = new InstagramUserRepository(database);
      await users.save(owners.saved);
      await users.save(owners.failing);
    }
    for (const [index, story] of scenario.saved.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- Saves are ordered: the first story owns the shared record.
      await repository.save(story, index === 0 ? owners?.saved : undefined);
    }
    const before = scenario.saved.map(({ pk }) => repository.findByMediaPk(pk));
    database.$client.exec(
      `CREATE TEMP TRIGGER ${trigger.name} ${trigger.on} ${trigger.when === undefined ? "" : `WHEN ${trigger.when}`}
        BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`,
    );

    await expect(repository.save(scenario.failing, owners?.failing)).rejects.toThrow();

    const cold = new StoryRepository(database);
    expect(scenario.saved.map(({ pk }) => cold.findByMediaPk(pk))).toStrictEqual(before);
    if (owners) {
      expect(cold.listByUsername(owners.saved.username)).toHaveLength(1);
      expect(cold.listByUsername(owners.failing.username)).toHaveLength(0);
    }

    database.$client.exec(`DROP TRIGGER ${trigger.name}`);
    await repository.save(scenario.retry, owners?.retry);
    scenario.verifyRetry(cold, database, before);
  },
);
