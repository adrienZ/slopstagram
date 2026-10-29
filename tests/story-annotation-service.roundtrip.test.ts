import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { assert, test, expect } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { ReportRepository } from "../sdk/repositories/report-repository.ts";
import { storyStickers } from "../sdk/entities/story.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { createManifestUsers, createOutputUsers } from "../sdk/story-output-service.ts";
import { fetchStories } from "../sdk/stories.ts";
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
  expect(stickers.map(({ kind, label, source }) => ({ kind, label, source }))).toStrictEqual([
    { kind: "location", label: "Paris, Paris", source: "story_locations" },
    { kind: "location", label: "Paris, Paris", source: "story_locations" },
    { kind: "custom", label: "unchanged:label", source: "unknown" },
  ]);
  expect(stickers.every((sticker) => (sticker.occurrenceId ?? "").length > 0)).toBeTruthy();
  expect(new Set(stickers.map((sticker) => sticker.occurrenceId)).size).toBe(3);
  migrateDatabase(database);
  await repository.save(stored);
  await repository.save(readStoredStory(repository, "old"));
  expect(new StoryRepository(database).findByMediaPk("old")).toStrictEqual(stored);
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
    return await fetchStories([], {
      client: createClient(
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
      logger: createCapturingLogger(),
      now: fixedNow,
      storyRepository: repository,
      storyStorage: createMemoryStorage<StoryItem>(),
    });
  }
  const report = await ingest(["sticker-a", "sticker-b"]);
  const before = readStoredStory(new StoryRepository(database));
  const original = before.annotations.stickers;
  expect(original[0].occurrenceId ?? "").toMatch(/\S/u);
  expect(original[0].occurrenceId).not.toBe(original[1].occurrenceId);
  expect(original.map((sticker) => sticker.providerOccurrenceId)).toStrictEqual([
    "sticker-a",
    "sticker-b",
  ]);
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
  expect(reordered.annotations.stickers.slice(1)).toStrictEqual([original[1], original[0]]);
  expect(reorderedReport.manifest.users[0].stories[0].stickers).toStrictEqual([
    "@friend",
    "Song - Artist",
    "Song - Artist",
  ]);
  expect(report.manifest.users[0].stories[0].stickers).toStrictEqual([
    "Song - Artist",
    "Song - Artist",
  ]);
  await cold.save(reordered, owner);
  await cold.save(reordered, owner);
  expect(new StoryRepository(database).findByMediaPk("m1")).toStrictEqual(reordered);
  await ingest(["sticker-a", "sticker-b"], { story_bloks_stickers: [] });
  expect(readStoredStory(cold).annotations.stickers).toStrictEqual(original);
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
  expect(
    before.stickers.every((sticker) => sticker.providerOccurrenceId === undefined),
  ).toBeTruthy();
  expect(new Set(before.stickers.map((sticker) => sticker.occurrenceId)).size).toBe(3);
  await repository.save({ pk: "m1", story_music_stickers: [music], story_locations: null });
  const replaced = readStoredStory(new StoryRepository(database)).annotations;
  expect(replaced.stickers[0].occurrenceId).not.toBe(before.stickers[0].occurrenceId);
  expect(replaced.stickers.slice(1)).toStrictEqual(before.stickers.slice(1));

  const identified = { ...music, id: "sticker" };
  await repository.save({ pk: "m1", story_music_stickers: [identified] });
  const [unique] = readStoredStory(repository).annotations.stickers;
  await repository.save({ pk: "m1", story_music_stickers: [identified, identified] });
  const ambiguous = readStoredStory(repository).annotations.stickers.slice(0, 2);
  expect(new Set(ambiguous.map((sticker) => sticker.occurrenceId)).size).toBe(2);
  expect(ambiguous.every((sticker) => sticker.occurrenceId !== unique.occurrenceId)).toBeTruthy();
  await repository.save({ pk: "m1", story_music_stickers: [] });
  await repository.save({ pk: "m1", story_music_stickers: [identified] });
  const [reintroduced] = readStoredStory(repository).annotations.stickers;
  expect(
    ambiguous.every((sticker) => sticker.occurrenceId !== reintroduced.occurrenceId),
  ).toBeTruthy();

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
  expect(clones.length).toBe(2);
  expect(clones.every((sticker) => sticker.occurrenceId !== location.occurrenceId)).toBeTruthy();
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
  const report = await fetchStories([], {
    client: createClient(tray, [reelsResponse({ r1: { ...reel("r1", [item]), user: owner } })]),
    logger: createCapturingLogger(),
    now: fixedNow,
    storyRepository: repository,
    storyStorage: createMemoryStorage<StoryItem>(),
  });
  expect(report.manifest.users[0]?.stories[0]?.locations).toStrictEqual(["Paris", "Paris"]);
  expect(report.manifest.users[0]?.stories[0]?.stickers).toStrictEqual([
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
  expect(users).toStrictEqual(report.manifest.users);
  expect(stored.story_bloks_stickers).toBe(undefined);
  expect(stored.story_locations).toBe(undefined);
  const coldReport = {
    ...report,
    manifest: { users },
    output: { users: createOutputUsers(users) },
  };
  await reportRepository.save("cold", coldReport);
  expect(reportRepository.findByKey("cold")).toStrictEqual(report);

  await coldRepository.save(stored, owner);
  await coldRepository.save(stored, owner);
  expect(coldRepository.findByMediaPk("m1")).toStrictEqual(stored);
  expect(coldRepository.listByUsername("one")[0]?.locations).toStrictEqual(["Paris", "Paris"]);
  expect(coldRepository.listByUsername("one")[0]?.stickers).toStrictEqual([
    "@friend",
    "@friend",
    "Song - Artist",
    "#weekend",
    "https://example.com",
  ]);
  expect(reportRepository.findByKey("original")).toStrictEqual(report);
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
    const original = await fetchStories([], {
      client: createClient(tray, [
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
      logger: createCapturingLogger(),
      now: fixedNow,
      storyRepository: repository,
      storyStorage: createMemoryStorage<StoryItem>(),
    });
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
    expect(users[0]?.stories[0]?.locations).toStrictEqual(expectedLocations);
    expect(users[0]?.stories[0]?.stickers).toStrictEqual(["@same", "mention:@same", "@same"]);
    expect(stored.annotations?.stickers.map((sticker) => sticker.kind)).toStrictEqual(
      unifiedLocations
        ? ["mention", "location", "location", "location", "custom", "mention"]
        : ["mention", "custom", "mention"],
    );
    await cold.save(stored, owner);
    await cold.save(stored, owner);
    expect(cold.findByMediaPk("m1")).toStrictEqual(stored);
    const [timeline] = cold.listByUsername("one");
    expect(timeline.locations).toStrictEqual(expectedLocations);
    expect(timeline.stickers).toStrictEqual(users[0]?.stories[0]?.stickers);
    expect(timeline.story).toStrictEqual(stored);
    expect(reports.findByKey("historical")).toStrictEqual(original);
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
    return await fetchStories([], {
      client: createClient(tray, [reelsResponse({ r1: { ...reel("r1", [item]), user: owner } })]),
      logger: createCapturingLogger(),
      now: fixedNow,
      storyRepository: repository,
      storyStorage: storage,
    });
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
  expect(updated.manifest.users[0]?.stories[0]?.locations).toStrictEqual(["Paris"]);
  expect(updated.manifest.users[0]?.stories[0]?.stickers).toStrictEqual([
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
  expect(createManifestUsers(tray, new Map([["m1", stored]]), new Map())).toStrictEqual(
    updated.manifest.users,
  );
  await cold.save(stored, owner);
  expect(cold.findByMediaPk("m1")).toStrictEqual(stored);
  expect(cold.listByUsername("one")[0]?.locations).toStrictEqual(["Paris"]);
  expect(reports.findByKey("before-partial")).toStrictEqual(original);
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
  expect(repository.findByMediaPk("m1")?.annotations).toStrictEqual(before);
  expect(
    logger.messages.some(
      (message) => message.includes("story_locations") && message.includes("m1"),
    ),
  ).toBeTruthy();
  expect(logger.messages.some((message) => message.includes("story_hashtags"))).toBeTruthy();
  expect(logger.messages.some((message) => message.includes("link"))).toBeTruthy();
  await repository.save({
    pk: "m1",
    story_bloks_stickers: [{ bloks_sticker: { sticker_data: {} } }],
  });
  expect(repository.findByMediaPk("m1")?.annotations).toStrictEqual(before);

  await repository.save({ pk: "m1", story_locations: null, story_hashtags: null, link: null });
  expect(repository.findByMediaPk("m1")?.annotations).toStrictEqual(before);
  await repository.save({ pk: "m1", story_locations: [], story_hashtags: [] });
  const cleared = new StoryRepository(database).findByMediaPk("m1");
  assert.ok(cleared);
  expect(cleared.annotations?.locations).toStrictEqual([]);
  assert.ok(cleared.annotations);
  expect(cleared.annotations.stickers.map((sticker) => sticker.label)).toStrictEqual([
    "@friend",
    "https://example.com",
  ]);
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
  expect(partial.annotations?.locations).toStrictEqual(["Old place"]);
  await repository.save(partial);
  expect(repository.findByMediaPk("legacy")).toStrictEqual(partial);
  await repository.save({
    pk: "legacy",
    story_bloks_stickers: [],
    story_music_stickers: [],
    story_hashtags: [],
  });
  expect(
    repository.findByMediaPk("legacy")?.annotations?.stickers.map((sticker) => sticker.label),
  ).toStrictEqual(["Old place", "old", "other:untouched"]);
  const links = {
    story_link_stickers: [],
    story_cta: [],
    story_bloks_tappables: [],
    text_post_share_to_ig_story_stickers: [],
  };
  await repository.save({ pk: "legacy", ...links });
  expect(
    repository.findByMediaPk("legacy")?.annotations?.stickers.map((sticker) => sticker.label),
  ).toStrictEqual(["Old place", "old", "other:untouched"]);
  await repository.save({
    pk: "legacy",
    ...links,
    link: [],
    story_bloks_stickers: [],
    story_locations: [],
  });
  const complete = repository.findByMediaPk("legacy");
  assert.ok(complete);
  assert.ok(partial.annotations);
  expect(complete.annotations?.stickers).toStrictEqual([
    {
      occurrenceId: partial.annotations.stickers.at(-1)?.occurrenceId,
      kind: "custom",
      label: "other:untouched",
      source: "unknown",
    },
  ]);
  await repository.save(complete);
  expect(repository.findByMediaPk("legacy")).toStrictEqual(complete);
});
