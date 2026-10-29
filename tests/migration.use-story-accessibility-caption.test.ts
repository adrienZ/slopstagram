import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test, type TestContext, expect } from "vitest";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { ReportRepository } from "../sdk/repositories/report-repository.ts";

const captionMigration = "20261022145708_use_story_accessibility_caption";
const migrations = fileURLToPath(new URL("../sdk/database/migrations", import.meta.url));

function createLegacyDatabase(context: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "report-caption-migration-"));
  const database = createDrizzle(":memory:");
  context.onTestFinished(() => {
    database.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });
  for (const entry of readdirSync(migrations)) {
    if (entry < captionMigration) {
      cpSync(path.join(migrations, entry), path.join(directory, entry), { recursive: true });
    }
  }
  migrate(database, { migrationsFolder: directory });
  database.$client.exec(`
    INSERT INTO reports (broadcastsCount, cacheHits, cacheMisses, createdAt, failedCount,
      fetchedCount, key, reelsCount, reportName, storiesCount)
    VALUES (0, 1, 0, '2026-10-22T12:00:00Z', 0, 0, 'legacy', 1, 'legacy', 1);
    INSERT INTO report_story_groups (reelId, reportKey, sortOrder, username)
    VALUES ('reel', 'legacy', 0, 'user');
    INSERT INTO report_stories (igCaption, locations, mediaPk, reelId, reportKey, sortOrder,
      status, stickers)
    VALUES ('Legacy caption', '["Paris"]', 'story', 'reel', 'legacy', 0, 'ok', '["mention:@friend"]');
  `);
  return database;
}

for (const caption of [null, "", " \t\n ", "\u00A0\uFEFF", undefined]) {
  test(`caption migration blocks report-only data loss when the story caption is ${JSON.stringify(caption)}`, (context) => {
    const database = createLegacyDatabase(context);
    if (caption !== undefined) {
      database.$client
        .prepare("INSERT INTO stories (mediaPk, accessibilityCaption) VALUES ('story', ?)")
        .run(caption);
    }

    expect(() => {
      migrateDatabase(database);
    }).toThrow(/INSERT INTO `__report_caption_removal_guard`/u);
    expect(database.$client.prepare("SELECT igCaption FROM report_stories").get()?.igCaption).toBe(
      "Legacy caption",
    );
    // A reviewed recovery in this fixture lets migration retry on the same connection.
    database.$client.exec(`INSERT INTO stories (mediaPk, accessibilityCaption)
      VALUES ('story', 'Recovered caption')
      ON CONFLICT(mediaPk) DO UPDATE SET accessibilityCaption = excluded.accessibilityCaption;`);
    migrateDatabase(database);
    expect(
      new ReportRepository(database).findByKey("legacy")?.output.users[0]?.stories[0]?.ig_caption,
    ).toBe("Recovered caption");
  });
}

test("caption migration keeps canonical captions and report snapshots, then removes legacy storage", (context) => {
  const database = createLegacyDatabase(context);
  database.$client.exec(`INSERT INTO stories (mediaPk, accessibilityCaption)
    VALUES ('story', ' Canonical caption ');`);
  const repository = new ReportRepository(database);
  const before = repository.findByKey("legacy");

  migrateDatabase(database);
  migrateDatabase(database);

  expect(repository.findByKey("legacy")).toStrictEqual(before);
  expect(before?.output.users[0]?.stories[0]?.ig_caption).toBe(" Canonical caption ");
  expect(
    database.$client
      .prepare("PRAGMA table_info(report_stories)")
      .all()
      .some((row) => row.name === "igCaption"),
  ).toBe(false);
  expect(database.$client.prepare("PRAGMA foreign_key_check").all()).toStrictEqual([]);
});

test("caption migration allows empty legacy captions and the N/A placeholder without inventing stories", (context) => {
  const database = createLegacyDatabase(context);
  database.$client.exec("UPDATE report_stories SET igCaption = 'N/A'");
  database.$client.exec(`INSERT INTO report_stories (igCaption, locations, mediaPk, reelId,
    reportKey, sortOrder, status, stickers)
    VALUES (' \t\n ', '[]', 'missing', 'reel', 'legacy', 1, 'failed', '[]');`);

  migrateDatabase(database);

  const report = new ReportRepository(database).findByKey("legacy");
  expect(report?.output.users[0]?.stories.map((story) => story.ig_caption)).toStrictEqual([
    "N/A",
    "N/A",
  ]);
  expect(database.$client.prepare("SELECT COUNT(*) AS count FROM stories").get()?.count).toBe(0);
});
