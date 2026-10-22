import assert from "node:assert/strict";
import { test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/entities/instagram-user.ts";
import { ReportRepository } from "../sdk/entities/report.ts";
import { StoryRepository, storyLocations, storyStickers } from "../sdk/entities/story.ts";
import { createManifestUsers, createOutputUsers } from "../sdk/story-output-service.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  reel,
  response,
  storyItemWithStickers,
} from "./mock-helpers.ts";
import type { StoryItem } from "../sdk/lib/types.ts";

test("story annotations survive ingestion, cold reports, and repeated saves", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.after(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const reportRepository = new ReportRepository(database);
  const owner = { full_name: "One", id: "id-1", pk: "user-1", username: "one" };
  await new InstagramUserRepository(database).save(owner);
  const tray = [{ id: "r1", media_ids: ["m1"], user: owner }];
  const item = storyItemWithStickers("m1", {
    story_bloks_stickers: [
      { bloks_sticker: { sticker_data: { ig_mention: { username: "friend" } } } },
    ],
    story_hashtags: [{ hashtag: "weekend" }],
    story_link_stickers: [{ story_link: { url: "https://example.com" } }],
    story_locations: [{ location: { name: "Paris" } }],
    story_music_stickers: [{ music_asset_info: { title: "Song", display_artist: "Artist" } }],
    taken_at: 1_767_225_600,
  });
  const report = await fetchStoriesManifest(
    createClient(tray, [response({ reels: { r1: { ...reel("r1", [item]), user: owner } } })]),
    {
      logger: createCapturingLogger(),
      now: fixedNow,
      storyRepository: repository,
      storyStorage: createMemoryStorage<StoryItem>(),
    },
  );
  await reportRepository.save("original", report);

  // A new repository reads only SQLite, without the raw story cache.
  const coldRepository = new StoryRepository(database);
  const stored = coldRepository.findByMediaPk("m1");
  assert.ok(stored);
  const users = createManifestUsers(tray, new Map([[stored.pk, stored]]), new Map());
  assert.deepEqual(users, report.manifest.users);
  assert.equal(stored.story_bloks_stickers, undefined);
  assert.equal(stored.story_locations, undefined);
  const coldReport = {
    ...report,
    manifest: { users },
    output: { users: createOutputUsers(users) },
  };
  await reportRepository.save("cold", coldReport);
  assert.deepEqual(reportRepository.findByKey("cold"), report);

  await coldRepository.save(stored, owner);
  await coldRepository.save(stored, owner);
  assert.deepEqual(coldRepository.findByMediaPk("m1"), stored);
  assert.deepEqual(coldRepository.listByUsername("one")[0]?.locations, ["Paris"]);
  assert.deepEqual(coldRepository.listByUsername("one")[0]?.stickers, [
    "mention:@friend",
    "music:Song - Artist",
    "hashtag:#weekend",
    "link:https://example.com",
  ]);
  assert.deepEqual(reportRepository.findByKey("original"), report);
});

for (const unifiedLocations of [false, true]) {
  test(`cold reads preserve occurrences using ${unifiedLocations ? "unified" : "legacy"} locations`, async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new StoryRepository(database);
    const reports = new ReportRepository(database);
    const owner = { full_name: "One", id: "id-1", pk: "user-1", username: "one" };
    await new InstagramUserRepository(database).save(owner);
    const tray = [{ id: "r1", media_ids: ["m1"], user: owner }];
    const original = await fetchStoriesManifest(
      createClient(tray, [
        response({
          reels: {
            r1: {
              ...reel("r1", [
                storyItemWithStickers("m1", {
                  story_locations: [{ location: { name: "Historical place" } }],
                  taken_at: 1_767_225_600,
                }),
              ]),
              user: owner,
            },
          },
        }),
      ]),
      {
        logger: createCapturingLogger(),
        now: fixedNow,
        storyRepository: repository,
        storyStorage: createMemoryStorage<StoryItem>(),
      },
    );
    await reports.save("historical", original);

    // Existing relational data may contain repeated labels and kinds unknown to the extractor.
    // Insert out of order to ensure reads use persisted occurrence order.
    const stickers = [
      { kind: "mention", label: "mention:@same", mediaPk: "m1", sortOrder: 9 },
      { kind: "custom", label: "mention:@same", mediaPk: "m1", sortOrder: 8 },
      { kind: "mention", label: "mention:@same", mediaPk: "m1", sortOrder: 2 },
    ];
    if (unifiedLocations) {
      stickers.push(
        { kind: "location", label: "Canonical place", mediaPk: "m1", sortOrder: 6 },
        { kind: "location", label: "Canonical place", mediaPk: "m1", sortOrder: 5 },
        { kind: "location", label: "First canonical place", mediaPk: "m1", sortOrder: 3 },
      );
    }
    await database.insert(storyStickers).values(stickers);
    await database.insert(storyLocations).values([
      { label: "Historical place", mediaPk: "m1", sortOrder: 1 },
      { label: "First legacy place", mediaPk: "m1", sortOrder: -1 },
    ]);

    const cold = new StoryRepository(database);
    const stored = cold.findByMediaPk("m1");
    assert.ok(stored);
    const expectedLocations = unifiedLocations
      ? ["First canonical place", "Canonical place", "Canonical place"]
      : ["First legacy place", "Historical place", "Historical place"];
    const users = createManifestUsers(tray, new Map([[stored.pk, stored]]), new Map());
    assert.deepEqual(users[0]?.stories[0]?.locations, expectedLocations);
    assert.deepEqual(users[0]?.stories[0]?.stickers, [
      "mention:@same",
      "mention:@same",
      "mention:@same",
    ]);
    assert.deepEqual(
      stored.annotations?.stickers.map((sticker) => sticker.kind),
      unifiedLocations
        ? ["mention", "location", "location", "location", "custom", "mention"]
        : ["mention", "custom", "mention"],
    );
    await cold.save(stored, owner);
    await cold.save(stored, owner);
    assert.deepEqual(cold.findByMediaPk("m1"), stored);
    const [timeline] = cold.listByUsername("one");
    assert.deepEqual(timeline.locations, expectedLocations);
    assert.deepEqual(timeline.stickers, users[0]?.stories[0]?.stickers);
    assert.deepEqual(timeline.story, stored);
    assert.deepEqual(reports.findByKey("historical"), original);
  });
}
