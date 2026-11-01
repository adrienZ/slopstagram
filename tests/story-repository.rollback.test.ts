import { assert, expect, test } from "vitest";
import type { StoryItem } from "../sdk/instagram-types.ts";
import type { DrizzleDatabase } from "../sdk/database/client.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { createTestDatabase } from "./test-database.ts";

const owner = { id: "u1", pk: "u1", username: "one", full_name: "One" };
const other = { id: "u2", pk: "u2", username: "two", full_name: "Two" };

interface RollbackScenario {
  name: string;
  /** Stories saved before the failure; the first belongs to `owner`. */
  saved: Array<StoryItem>;
  /** A temporary trigger that makes one of the save's writes fail. */
  trigger: { name: string; sql: string };
  /** The save that fails, made by `other` when the scenario has owners. */
  failing: StoryItem;
  /** The save that succeeds once the trigger is gone. */
  retry: StoryItem;
  withOwners: boolean;
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
    withOwners: true,
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
      sql: `CREATE TEMP TRIGGER reject_promotion BEFORE UPDATE ON story_location_observations
        WHEN NEW.locationId IS NOT NULL BEGIN SELECT RAISE(ABORT, 'fixture promotion failure'); END`,
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
      const [observation] = annotationsOf(cold, "m1").locationObservations ?? [];
      expect(observation.metadata).toMatchObject({ status: "usable", name: "Old" });
    },
  },
  {
    name: "music metadata update",
    withOwners: true,
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
    trigger: {
      name: "reject_partial_removal",
      sql: `CREATE TEMP TRIGGER reject_partial_removal BEFORE UPDATE ON metadata_music
        BEGIN SELECT RAISE(ABORT, 'fixture promotion failure'); END`,
    },
    failing: promotedMusic,
    retry: promotedMusic,
    verifyRetry: (cold, database, [before]) => {
      const [first] = annotationsOf(cold, "m1").musicObservations ?? [];
      const [second] = annotationsOf(cold, "m2").musicObservations ?? [];
      expect(first.metadata).toMatchObject({ status: "usable", title: "Song", artist: "Artist" });
      expect(first.metadata).toStrictEqual(second.metadata);
      expect(first.occurrenceId).toBe(before?.annotations?.stickers[0].occurrenceId);
      expect(cold.listByUsername("two")).toHaveLength(1);
      expect(database.$client.prepare("SELECT count(*) n FROM metadata_music").get()?.n).toBe(1);
    },
  },
  {
    name: "annotation replacement",
    withOwners: false,
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
      sql: `CREATE TEMP TRIGGER reject_annotation BEFORE INSERT ON story_stickers
        WHEN NEW.label = '#fail' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END`,
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
    if (scenario.withOwners) {
      const users = new InstagramUserRepository(database);
      await users.save(owner);
      await users.save(other);
    }
    for (const [index, story] of scenario.saved.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- Saves are ordered: the first story owns the shared record.
      await repository.save(story, index === 0 && scenario.withOwners ? owner : undefined);
    }
    const before = scenario.saved.map(({ pk }) => repository.findByMediaPk(pk));
    database.$client.exec(scenario.trigger.sql);

    await expect(
      repository.save(scenario.failing, scenario.withOwners ? other : undefined),
    ).rejects.toThrow();

    const cold = new StoryRepository(database);
    expect(scenario.saved.map(({ pk }) => cold.findByMediaPk(pk))).toStrictEqual(before);
    if (scenario.withOwners) {
      expect(cold.listByUsername("one")).toHaveLength(1);
      expect(cold.listByUsername("two")).toHaveLength(0);
    }

    database.$client.exec(`DROP TRIGGER ${scenario.trigger.name}`);
    await repository.save(scenario.retry, scenario.withOwners ? other : undefined);
    scenario.verifyRetry(cold, database, before);
  },
);
