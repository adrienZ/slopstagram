import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { ReportRepository } from "../sdk/repositories/report-repository.ts";
import { storyStickers } from "../sdk/entities/story.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { createManifestUsers, createOutputUsers } from "../sdk/story-output-service.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  reel,
  storyItemWithStickers,
  reelsResponse,
} from "./mock-helpers.ts";
import type { StoryItem } from "../sdk/instagram-types.ts";

function readStoredStory(repository: StoryRepository, mediaPk = "m1") {
  const stored = repository.findByMediaPk(mediaPk);
  assert.ok(stored);
  assert.ok(stored.annotations);
  return { ...stored, annotations: stored.annotations };
}

test("upgrading existing occurrences preserves duplicates, order and provenance", async (context) => {
  const database = createDrizzle(":memory:");
  const staging = mkdtempSync(path.join(tmpdir(), "sticker-occurrences-"));
  context.onTestFinished(() => {
    database.$client.close();
    rmSync(staging, { recursive: true, force: true });
  });
  const migrations = fileURLToPath(new URL("../sdk/database/migrations", import.meta.url));
  for (const name of readdirSync(migrations)) {
    if (name < "20261024001923") {
      cpSync(path.join(migrations, name), path.join(staging, name), { recursive: true });
    }
  }
  migrate(database, { migrationsFolder: staging });
  database.$client.exec(`
    INSERT INTO stories (mediaPk) VALUES ('old');
    INSERT INTO story_stickers (mediaPk, sortOrder, kind, label, source) VALUES
      ('old', 9, 'custom', 'unchanged:label', 'unknown'),
      ('old', 2, 'location', 'Paris, Paris', 'story_locations'),
      ('old', 6, 'location', 'Paris, Paris', 'story_locations');
    INSERT INTO story_sticker_sources (mediaPk, source) VALUES
      ('old', 'story_locations'), ('old', 'story_music_stickers');
  `);
  migrateDatabase(database);
  const repository = new StoryRepository(database);
  const stored = readStoredStory(repository, "old");
  const { stickers } = stored.annotations;
  assert.deepEqual(
    stickers.map(({ kind, label, source }) => ({ kind, label, source })),
    [
      { kind: "location", label: "Paris, Paris", source: "story_locations" },
      { kind: "location", label: "Paris, Paris", source: "story_locations" },
      { kind: "custom", label: "unchanged:label", source: "unknown" },
    ],
  );
  assert.ok(stickers.every((sticker) => (sticker.occurrenceId ?? "").length > 0));
  assert.equal(new Set(stickers.map((sticker) => sticker.occurrenceId)).size, 3);
  migrateDatabase(database);
  await repository.save(stored);
  await repository.save(readStoredStory(repository, "old"));
  assert.deepEqual(new StoryRepository(database).findByMediaPk("old"), stored);
});

test("provider-identified occurrences keep their identities through reordering and cold resaves", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const owner = { full_name: "One", id: "u1", pk: "u1", username: "one" };
  await new InstagramUserRepository(database).save(owner);
  async function ingest(ids: Array<string>, extra: Partial<StoryItem> = {}) {
    return await fetchStoriesManifest(
      createClient(
        [{ id: "r1", media_ids: ["m1"], user: owner }],
        [
          reelsResponse({
            r1: {
              ...reel("r1", [
                storyItemWithStickers("m1", {
                  taken_at: 1_767_225_600,
                  story_music_stickers: ids.map((id) => ({
                    id,
                    music_asset_info: {
                      audio_asset_id: "shared-audio",
                      title: "Song",
                      display_artist: "Artist",
                    },
                  })),
                  ...extra,
                }),
              ]),
              user: owner,
            },
          }),
        ],
      ),
      {
        logger: createCapturingLogger(),
        now: fixedNow,
        storyRepository: repository,
        storyStorage: createMemoryStorage<StoryItem>(),
      },
    );
  }
  const report = await ingest(["sticker-a", "sticker-b"]);
  const before = readStoredStory(new StoryRepository(database));
  const original = before.annotations.stickers;
  assert.match(original[0].occurrenceId ?? "", /\S/u);
  assert.notEqual(original[0].occurrenceId, original[1].occurrenceId);
  assert.deepEqual(
    original.map((sticker) => sticker.providerOccurrenceId),
    ["sticker-a", "sticker-b"],
  );
  const reorderedReport = await ingest(["sticker-b", "sticker-a"], {
    story_bloks_stickers: [
      {
        id: "mention-a",
        bloks_sticker: {
          sticker_data: { ig_mention: { username: "friend" } },
        },
      },
    ],
  });
  const cold = new StoryRepository(database);
  const reordered = readStoredStory(cold);
  assert.deepEqual(reordered.annotations.stickers.slice(1), [original[1], original[0]]);
  assert.deepEqual(reorderedReport.manifest.users[0].stories[0].stickers, [
    "@friend",
    "Song - Artist",
    "Song - Artist",
  ]);
  assert.deepEqual(report.manifest.users[0].stories[0].stickers, [
    "Song - Artist",
    "Song - Artist",
  ]);
  await cold.save(reordered, owner);
  await cold.save(reordered, owner);
  assert.deepEqual(new StoryRepository(database).findByMediaPk("m1"), reordered);
  await ingest(["sticker-a", "sticker-b"], { story_bloks_stickers: [] });
  assert.deepEqual(readStoredStory(cold).annotations.stickers, original);
});

test("uncertain replacements never inherit identities from labels or shared asset identifiers", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const music = { music_asset_info: { id: "audio", audio_asset_id: "audio", title: "Same" } };
  const locations = [
    { location: { pk: "place", name: "Same" } },
    { location: { pk: "place", name: "Same" } },
  ];
  await repository.save({ pk: "m1", story_music_stickers: [music], story_locations: locations });
  const before = readStoredStory(new StoryRepository(database)).annotations;
  assert.ok(before.stickers.every((sticker) => sticker.providerOccurrenceId === undefined));
  assert.equal(new Set(before.stickers.map((sticker) => sticker.occurrenceId)).size, 3);
  await repository.save({ pk: "m1", story_music_stickers: [music], story_locations: null });
  const replaced = readStoredStory(new StoryRepository(database)).annotations;
  assert.notEqual(replaced.stickers[0].occurrenceId, before.stickers[0].occurrenceId);
  assert.deepEqual(replaced.stickers.slice(1), before.stickers.slice(1));

  const identified = { ...music, id: "sticker" };
  await repository.save({ pk: "m1", story_music_stickers: [identified] });
  const [unique] = readStoredStory(repository).annotations.stickers;
  await repository.save({ pk: "m1", story_music_stickers: [identified, identified] });
  const ambiguous = readStoredStory(repository).annotations.stickers.slice(0, 2);
  assert.equal(new Set(ambiguous.map((sticker) => sticker.occurrenceId)).size, 2);
  assert.ok(ambiguous.every((sticker) => sticker.occurrenceId !== unique.occurrenceId));
  await repository.save({ pk: "m1", story_music_stickers: [] });
  await repository.save({ pk: "m1", story_music_stickers: [identified] });
  const [reintroduced] = readStoredStory(repository).annotations.stickers;
  assert.ok(ambiguous.every((sticker) => sticker.occurrenceId !== reintroduced.occurrenceId));

  // A caller cloning a cold occurrence cannot choose which clone inherits its identity.
  const location = readStoredStory(repository).annotations.stickers.find(
    (sticker) => sticker.kind === "location",
  );
  assert.ok(location);
  await repository.save({
    pk: "m1",
    annotations: {
      locations: [],
      stickers: [location, { ...location }],
    },
  });
  const clones = readStoredStory(repository).annotations.stickers;
  assert.equal(clones.length, 2);
  assert.ok(clones.every((sticker) => sticker.occurrenceId !== location.occurrenceId));
});

test("story annotations survive ingestion, cold reports, and repeated saves", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
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
    createClient(tray, [reelsResponse({ r1: { ...reel("r1", [item]), user: owner } })]),
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
    context.onTestFinished(() => {
      database.$client.close();
    });
    const repository = new StoryRepository(database);
    const reports = new ReportRepository(database);
    const owner = { full_name: "One", id: "id-1", pk: "user-1", username: "one" };
    await new InstagramUserRepository(database).save(owner);
    const tray = [{ id: "r1", media_ids: ["m1"], user: owner }];
    const original = await fetchStoriesManifest(
      createClient(tray, [
        reelsResponse({
          r1: {
            ...reel("r1", [
              storyItemWithStickers("m1", {
                story_locations: [{ location: { name: "Historical place" } }],
                taken_at: 1_767_225_600,
              }),
            ]),
            user: owner,
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
  context.onTestFinished(() => {
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
      createClient(tray, [reelsResponse({ r1: { ...reel("r1", [item]), user: owner } })]),
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
  context.onTestFinished(() => {
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
});

test("legacy provenance survives partial observations until one complete observation supersedes its kind", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
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
    {
      occurrenceId: partial.annotations.stickers.at(-1)?.occurrenceId,
      kind: "custom",
      label: "other:untouched",
      source: "unknown",
    },
  ]);
  await repository.save(complete);
  assert.deepEqual(repository.findByMediaPk("legacy"), complete);
});

test("a failed annotation replacement rolls back occurrences", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
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
