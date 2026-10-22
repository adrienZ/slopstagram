import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { StoryRepository } from "../sdk/entities/story.ts";

const migrationsFolder = fileURLToPath(new URL("../sdk/database/migrations", import.meta.url));
const previousMigration = "20261022091929_user_summary_instagram_pk";

function createPreviousDatabase(context: TestContext) {
  const scratch = mkdtempSync(path.join(tmpdir(), "slopstagram-sticker-migration-"));
  const previousFolder = path.join(scratch, "migrations");
  const client = new DatabaseSync(":memory:");
  context.after(() => {
    client.close();
    rmSync(scratch, { recursive: true, force: true });
  });
  for (const entry of readdirSync(migrationsFolder)) {
    if (entry <= previousMigration) {
      cpSync(path.join(migrationsFolder, entry), path.join(previousFolder, entry), {
        recursive: true,
      });
    }
  }
  const database = drizzle({ client });
  migrate(database, { migrationsFolder: previousFolder });
  client.exec("PRAGMA foreign_keys = ON");
  return { client, database };
}

test("the sticker migration preserves historical occurrences and preceding application writes", async (context) => {
  const { client, database } = createPreviousDatabase(context);
  client.exec(`
    INSERT INTO instagram_users (pk, id, username) VALUES ('owner', 'owner-id', 'one');
    INSERT INTO stories (mediaPk, instagramUserPk, takenAt, accessibilityCaption) VALUES
      ('locations-only', 'owner', 100, 'Location story'),
      ('stickers-only', 'owner', 101, 'Sticker story'),
      ('both', 'owner', 102, 'Both'),
      ('empty', 'owner', 103, 'Empty');
    INSERT INTO story_locations (mediaPk, label, sortOrder) VALUES
      ('locations-only', 'Paris', 9), ('locations-only', 'Paris', -2),
      ('both', 'Cafe', 70), ('both', 'First place', -3);
    INSERT INTO story_stickers (mediaPk, kind, label, sortOrder) VALUES
      ('stickers-only', 'mention', 'mention:@same', 40),
      ('stickers-only', 'custom', 'mention:@same', -4),
      ('stickers-only', 'mention', 'mention:@same', 2),
      ('both', 'link', 'link:https://example.com', 8),
      ('both', 'location', 'Cafe', 3);
    INSERT INTO reports (
      key, broadcastsCount, cacheHits, cacheMisses, createdAt, failedCount,
      fetchedCount, reelsCount, reportName, storiesCount
    ) VALUES ('report', 0, 0, 0, '2026-10-22', 0, 1, 1, 'Historical', 1);
    INSERT INTO report_stories (
      reportKey, reelId, mediaPk, igCaption, locations, sortOrder, status, stickers
    ) VALUES ('report', 'reel', 'both', 'Old caption', '["Historical place"]',
      0, 'ok', '["mention:@historical"]');
    INSERT INTO story_image_versions (mediaPk, sortOrder, url) VALUES ('both', 0, 'image-url');
    INSERT INTO story_video_versions (mediaPk, sortOrder, url) VALUES ('both', 0, 'video-url');
    INSERT INTO vision (mediaPk, model, promptHash, text, visual)
      VALUES ('both', 'model', 'hash', 'OCR', 'Description');
  `);
  const protectedTables = [
    "stories",
    "instagram_users",
    "story_locations",
    "story_image_versions",
    "story_video_versions",
    "reports",
    "report_stories",
    "report_story_groups",
    "report_failures",
    "user_summaries",
    "vision",
    "apple_vision",
  ];
  function snapshot() {
    return protectedTables.map((table) => ({
      table,
      rows: client.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
    }));
  }
  const before = snapshot();

  migrate(database, { migrationsFolder });

  function occurrences() {
    return client
      .prepare(
        "SELECT mediaPk, kind, label, sortOrder, source FROM story_stickers ORDER BY mediaPk, sortOrder",
      )
      .all()
      .map((row) => ({ ...row }));
  }
  assert.deepEqual(occurrences(), [
    { mediaPk: "both", kind: "location", label: "Cafe", sortOrder: 0, source: "unknown" },
    {
      mediaPk: "both",
      kind: "link",
      label: "link:https://example.com",
      sortOrder: 1,
      source: "unknown",
    },
    { mediaPk: "both", kind: "location", label: "First place", sortOrder: 2, source: "unknown" },
    { mediaPk: "both", kind: "location", label: "Cafe", sortOrder: 3, source: "unknown" },
    {
      mediaPk: "locations-only",
      kind: "location",
      label: "Paris",
      sortOrder: 0,
      source: "unknown",
    },
    {
      mediaPk: "locations-only",
      kind: "location",
      label: "Paris",
      sortOrder: 1,
      source: "unknown",
    },
    {
      mediaPk: "stickers-only",
      kind: "custom",
      label: "mention:@same",
      sortOrder: 0,
      source: "unknown",
    },
    {
      mediaPk: "stickers-only",
      kind: "mention",
      label: "mention:@same",
      sortOrder: 1,
      source: "unknown",
    },
    {
      mediaPk: "stickers-only",
      kind: "mention",
      label: "mention:@same",
      sortOrder: 2,
      source: "unknown",
    },
  ]);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(client.prepare("SELECT * FROM story_sticker_sources").all(), []);
  assert.deepEqual(client.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(client.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  const migrated = occurrences();
  const journal = client.prepare("SELECT * FROM __drizzle_migrations ORDER BY id").all();
  migrate(database, { migrationsFolder });
  assert.deepEqual(occurrences(), migrated);
  assert.deepEqual(client.prepare("SELECT * FROM __drizzle_migrations ORDER BY id").all(), journal);

  // The preceding repository omits provenance and still rewrites both annotation tables.
  const repository = new StoryRepository(database);
  const stored = repository.findByMediaPk("locations-only");
  assert.ok(stored);
  assert.deepEqual(stored.annotations?.locations, ["Paris", "Paris"]);
  await repository.save(stored);
  assert.deepEqual(repository.findByMediaPk("locations-only"), stored);
  assert.deepEqual(
    repository.listByUsername("one").find((story) => story.story.pk === "both")?.locations,
    ["Cafe", "First place", "Cafe"],
  );
  assert.equal(
    client.prepare("SELECT source FROM story_stickers WHERE mediaPk = 'locations-only'").get()
      ?.source,
    "unknown",
  );
  await repository.save({
    pk: "fresh",
    story_locations: [{ location: { name: "New place" } }],
    story_hashtags: [{ hashtag: "new" }],
  });
  assert.deepEqual(repository.findByMediaPk("fresh")?.annotations, {
    locations: ["New place"],
    stickers: [{ kind: "hashtag", label: "hashtag:#new" }],
  });

  // Presence can represent an observed empty field without inventing an occurrence.
  client.exec(
    "INSERT INTO story_sticker_sources (mediaPk, source) VALUES ('empty', 'story_locations')",
  );
  assert.equal(
    client.prepare("SELECT COUNT(*) AS count FROM story_stickers WHERE mediaPk = 'empty'").get()
      ?.count,
    0,
  );
  assert.throws(() => {
    client.exec(
      "INSERT INTO story_sticker_sources (mediaPk, source) VALUES ('empty', 'story_locations')",
    );
  });
  assert.throws(() => {
    client.exec(
      "INSERT INTO story_sticker_sources (mediaPk, source) VALUES ('missing', 'story_locations')",
    );
  });
  client.exec("DELETE FROM stories WHERE mediaPk = 'empty'");
  assert.deepEqual(client.prepare("SELECT * FROM story_sticker_sources").all(), []);
});

test("a failed sticker backfill rolls back schema, annotations and the migration ledger", (context) => {
  const { client, database } = createPreviousDatabase(context);
  client.exec(`
    INSERT INTO stories (mediaPk) VALUES ('story');
    INSERT INTO story_stickers (mediaPk, kind, label, sortOrder)
      VALUES ('story', 'custom', 'Existing sticker', 7);
    INSERT INTO story_locations (mediaPk, label, sortOrder)
      VALUES ('story', 'Existing location', 9);
    CREATE TRIGGER fail_sticker_backfill BEFORE INSERT ON story_stickers
      BEGIN SELECT RAISE(ABORT, 'injected sticker backfill failure'); END;
  `);
  const before = client.prepare("SELECT * FROM story_stickers").all();
  const locations = client.prepare("SELECT * FROM story_locations").all();
  const schema = client.prepare("SELECT * FROM sqlite_schema ORDER BY type, name").all();
  const journal = client.prepare("SELECT * FROM __drizzle_migrations ORDER BY id").all();

  let failure: Error | undefined;
  try {
    migrate(database, { migrationsFolder });
  } catch (error) {
    assert.ok(error instanceof Error);
    failure = error;
  }
  assert.ok(failure?.cause instanceof Error);
  assert.match(failure.cause.message, /injected sticker backfill failure/u);

  assert.deepEqual(client.prepare("SELECT * FROM story_stickers").all(), before);
  assert.deepEqual(client.prepare("SELECT * FROM story_locations").all(), locations);
  assert.deepEqual(client.prepare("SELECT * FROM sqlite_schema ORDER BY type, name").all(), schema);
  assert.deepEqual(client.prepare("SELECT * FROM sqlite_temp_schema").all(), []);
  assert.deepEqual(client.prepare("SELECT * FROM __drizzle_migrations ORDER BY id").all(), journal);
  assert.deepEqual(client.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(client.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
});
