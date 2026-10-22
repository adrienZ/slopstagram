import assert from "node:assert/strict";
import { test } from "node:test";
import { createDrizzle } from "@slopstagram/sdk/database/client.ts";
import { migrateDatabase } from "@slopstagram/sdk/database/migrate.ts";
import { InstagramUserRepository } from "@slopstagram/sdk/repositories/instagram-user-repository.ts";
import { ReportRepository } from "@slopstagram/sdk/repositories/report-repository.ts";
import { storyStickers } from "@slopstagram/sdk/entities/story.ts";
import { StoryRepository } from "@slopstagram/sdk/repositories/story-repository.ts";
import { createManifestUsers, createOutputUsers } from "@slopstagram/sdk/story-output-service.ts";
import { fetchStoriesManifest } from "@slopstagram/sdk/stories.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  reel,
  response,
  storyItemWithStickers,
} from "./mock-helpers.ts";
import type { StoryItem } from "@slopstagram/sdk/lib/types.ts";

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
      { bloks_sticker: { sticker_data: { ig_mention: { username: "friend" } } } },
    ],
    story_hashtags: [{ hashtag: "weekend" }],
    story_link_stickers: [{ story_link: { url: "https://example.com" } }],
    story_locations: [{ location: { name: "Paris" } }, { location: { name: "Paris" } }],
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
  assert.deepEqual(report.manifest.users[0]?.stories[0]?.locations, ["Paris", "Paris"]);
  assert.deepEqual(report.manifest.users[0]?.stories[0]?.stickers, [
    "@friend",
    "@friend",
    "Song - Artist",
    "#weekend",
    "https://example.com",
  ]);
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
  assert.deepEqual(coldRepository.listByUsername("one")[0]?.locations, ["Paris", "Paris"]);
  assert.deepEqual(coldRepository.listByUsername("one")[0]?.stickers, [
    "@friend",
    "@friend",
    "Song - Artist",
    "#weekend",
    "https://example.com",
  ]);
  assert.deepEqual(reportRepository.findByKey("original"), report);
});

for (const unifiedLocations of [false, true]) {
  test(`cold reads preserve occurrences using ${unifiedLocations ? "unified locations" : "no unified locations"}`, async (context) => {
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
      { kind: "mention", label: "@same", mediaPk: "m1", sortOrder: 9 },
      { kind: "custom", label: "mention:@same", mediaPk: "m1", sortOrder: 8 },
      { kind: "mention", label: "@same", mediaPk: "m1", sortOrder: 2 },
    ];
    if (unifiedLocations) {
      stickers.push(
        { kind: "location", label: "Unified place", mediaPk: "m1", sortOrder: 6 },
        { kind: "location", label: "Unified place", mediaPk: "m1", sortOrder: 5 },
        { kind: "location", label: "First unified place", mediaPk: "m1", sortOrder: 3 },
      );
    }
    database.$client.exec("DELETE FROM story_stickers WHERE mediaPk = 'm1'");
    await database.insert(storyStickers).values(stickers);

    const cold = new StoryRepository(database);
    const stored = cold.findByMediaPk("m1");
    assert.ok(stored);
    const expectedLocations = unifiedLocations
      ? ["First unified place", "Unified place", "Unified place"]
      : [];
    const users = createManifestUsers(tray, new Map([[stored.pk, stored]]), new Map());
    assert.deepEqual(users[0]?.stories[0]?.locations, expectedLocations);
    assert.deepEqual(users[0]?.stories[0]?.stickers, ["@same", "mention:@same", "@same"]);
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

test("partial ingestion merges sources for fresh reports, cold reads, and resaves", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.after(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const reports = new ReportRepository(database);
  const owner = { full_name: "One", id: "u1", pk: "u1", username: "one" };
  await new InstagramUserRepository(database).save(owner);
  const tray = [{ id: "r1", media_ids: ["m1"], user: owner }];
  const storage = createMemoryStorage<StoryItem>();
  async function ingest(item: StoryItem) {
    return await fetchStoriesManifest(
      createClient(tray, [response({ reels: { r1: { ...reel("r1", [item]), user: owner } } })]),
      {
        logger: createCapturingLogger(),
        now: fixedNow,
        storyRepository: repository,
        storyStorage: storage,
      },
    );
  }
  const original = await ingest(
    storyItemWithStickers("m1", {
      taken_at: 1_767_225_600,
      story_bloks_stickers: [
        {
          bloks_sticker: {
            sticker_data: { ig_mention: { username: "same" }, location: { name: "Paris" } },
          },
        },
        { bloks_sticker: { sticker_data: { ig_mention: { username: "same" } } } },
      ],
      story_locations: [{ location: { name: "Paris" } }, { location: { name: "Paris" } }],
      story_hashtags: [{ hashtag: "old" }],
      story_music_stickers: [{ music_asset_info: { title: "Song" } }],
      story_link_stickers: [{ url: "https://example.com" }],
      story_cta: [{ url: "https://example.com" }],
    }),
  );
  await reports.save("before-partial", original);
  const partial = storyItemWithStickers("m1", {
    taken_at: 1_767_225_600,
    story_locations: [],
    story_hashtags: [{ hashtag: "new" }],
    story_music_stickers: null,
  });
  const updated = await ingest(partial);
  assert.deepEqual(updated.manifest.users[0]?.stories[0]?.locations, ["Paris"]);
  assert.deepEqual(updated.manifest.users[0]?.stories[0]?.stickers, [
    "@same",
    "@same",
    "Song",
    "#new",
    "https://example.com",
    "https://example.com",
  ]);
  await ingest(partial);
  const cold = new StoryRepository(database);
  const stored = cold.findByMediaPk("m1");
  assert.ok(stored);
  assert.equal(stored.annotations?.sources?.includes("story_locations"), true);
  assert.deepEqual(
    createManifestUsers(tray, new Map([["m1", stored]]), new Map()),
    updated.manifest.users,
  );
  await cold.save(stored, owner);
  assert.deepEqual(cold.findByMediaPk("m1"), stored);
  assert.deepEqual(cold.listByUsername("one")[0]?.locations, ["Paris"]);
  assert.deepEqual(reports.findByKey("before-partial"), original);
});

test("malformed sources preserve saved contributions and report the affected fields", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.after(() => {
    database.$client.close();
  });
  const logger = createCapturingLogger();
  const repository = new StoryRepository(database, logger);
  await repository.save({
    pk: "m1",
    story_locations: [{ location: { name: "Paris" } }],
    story_hashtags: [{ hashtag: "old" }],
    link: { url: "https://example.com" },
  });
  await repository.save({
    pk: "m1",
    story_bloks_stickers: [
      { bloks_sticker: { sticker_data: { ig_mention: { username: "friend" } } } },
    ],
  });
  const before = repository.findByMediaPk("m1")?.annotations;
  await repository.save({
    pk: "m1",
    story_locations: [{ location: { name: "New" } }, null],
    story_hashtags: "invalid",
    link: {},
  });
  assert.deepEqual(repository.findByMediaPk("m1")?.annotations, before);
  assert.ok(
    logger.messages.some(
      (message) => message.includes("story_locations") && message.includes("m1"),
    ),
  );
  assert.ok(logger.messages.some((message) => message.includes("story_hashtags")));
  assert.ok(logger.messages.some((message) => message.includes("link")));
  await repository.save({
    pk: "m1",
    story_bloks_stickers: [{ bloks_sticker: { sticker_data: {} } }],
  });
  assert.deepEqual(repository.findByMediaPk("m1")?.annotations, before);

  await repository.save({ pk: "m1", story_locations: null, story_hashtags: null, link: null });
  assert.deepEqual(repository.findByMediaPk("m1")?.annotations, before);
  await repository.save({ pk: "m1", story_locations: [], story_hashtags: [] });
  const cleared = new StoryRepository(database).findByMediaPk("m1");
  assert.ok(cleared);
  assert.deepEqual(cleared.annotations?.locations, []);
  assert.deepEqual(
    cleared.annotations.stickers.map((sticker) => sticker.label),
    ["@friend", "https://example.com"],
  );
  assert.equal(cleared.annotations.sources?.includes("story_locations"), true);
  assert.equal(cleared.annotations.sources.includes("story_hashtags"), true);
});

test("legacy provenance survives partial observations until one complete observation supersedes its kind", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.after(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "legacy",
    annotations: {
      locations: ["Old place"],
      stickers: [
        { kind: "mention", label: "mention:@old" },
        { kind: "mention", label: "mention:@old" },
        { kind: "location", label: "Old place" },
        { kind: "music", label: "music:Old" },
        { kind: "hashtag", label: "hashtag:#old" },
        { kind: "link", label: "link:old" },
        { kind: "custom", label: "other:untouched" },
      ],
    },
  });
  await repository.save({ pk: "legacy", story_locations: [] });
  const partial = repository.findByMediaPk("legacy");
  assert.ok(partial);
  assert.deepEqual(partial.annotations?.locations, ["Old place"]);
  await repository.save(partial);
  assert.deepEqual(repository.findByMediaPk("legacy"), partial);
  await repository.save({
    pk: "legacy",
    story_bloks_stickers: [],
    story_music_stickers: [],
    story_hashtags: [],
  });
  assert.deepEqual(
    repository.findByMediaPk("legacy")?.annotations?.stickers.map((sticker) => sticker.label),
    ["Old place", "old", "other:untouched"],
  );
  const links = {
    story_link_stickers: [],
    story_cta: [],
    story_bloks_tappables: [],
    text_post_share_to_ig_story_stickers: [],
  };
  await repository.save({ pk: "legacy", ...links });
  assert.deepEqual(
    repository.findByMediaPk("legacy")?.annotations?.stickers.map((sticker) => sticker.label),
    ["Old place", "old", "other:untouched"],
  );
  await repository.save({
    pk: "legacy",
    ...links,
    link: [],
    story_bloks_stickers: [],
    story_locations: [],
  });
  const complete = repository.findByMediaPk("legacy");
  assert.ok(complete);
  assert.deepEqual(complete.annotations?.stickers, [
    { kind: "custom", label: "other:untouched", source: "unknown" },
  ]);
  await repository.save(complete);
  assert.deepEqual(repository.findByMediaPk("legacy"), complete);
});

test("a failed annotation replacement rolls back occurrences and known empty sources", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.after(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "m1",
    story_hashtags: [{ hashtag: "old" }],
    story_locations: [],
    story_music_stickers: [{ music_asset_info: { title: "Old" } }],
  });
  const before = repository.findByMediaPk("m1");
  database.$client.exec(`CREATE TEMP TRIGGER reject_annotation BEFORE INSERT ON story_stickers
    WHEN NEW.label = '#fail' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END`);
  await assert.rejects(
    repository.save({ pk: "m1", story_hashtags: [{ hashtag: "fail" }], story_music_stickers: [] }),
  );
  assert.deepEqual(new StoryRepository(database).findByMediaPk("m1"), before);
  database.$client.exec("DROP TRIGGER reject_annotation");
  await repository.save({
    pk: "m1",
    story_hashtags: [{ hashtag: "ok" }],
    story_music_stickers: [],
  });
  assert.deepEqual(
    repository.findByMediaPk("m1")?.annotations?.stickers.map((sticker) => sticker.label),
    ["#ok"],
  );
});
