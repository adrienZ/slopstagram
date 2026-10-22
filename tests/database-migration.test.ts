import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { createDrizzle } from "../sdk/database/client.ts";
import { ReportRepository } from "../sdk/entities/report.ts";
import { StoryRepository } from "../sdk/entities/story.ts";
import { UserSummaryRepository } from "../sdk/entities/user-summary.ts";

test("backfills populated legacy databases without losing snapshots or unmatched summary owners", (context) => {
  const folder = mkdtempSync(path.join(tmpdir(), "slopstagram-migrations-"));
  const database = createDrizzle(":memory:");
  context.after(() => {
    database.$client.close();
    rmSync(folder, { force: true, recursive: true });
  });
  const migrations = fileURLToPath(new URL("../sdk/database/migrations", import.meta.url));
  const latest = "20261022090654_improve_story_groups_and_user_profiles";
  for (const entry of readdirSync(migrations)) {
    cpSync(path.join(migrations, entry), path.join(folder, entry), { recursive: true });
  }
  migrate(database, { migrationsFolder: folder });
  database.$client.exec(`
    INSERT INTO instagram_users (fullName, id, pk, username) VALUES
      ('Traveler', 'id-1', 'pk-1', 'traveler'),
      (NULL, 'id-2', 'pk-2', 'ambiguous'), (NULL, 'id-3', 'pk-3', 'ambiguous');
    INSERT INTO user_summaries (promptHash, result, sourceHash, userKey) VALUES
      ('prompt', 'Matched summary', 'matched', ' traveler '),
      ('prompt', 'Unmatched summary', 'unmatched', 'missing-user'),
      ('prompt', 'Ambiguous summary', 'ambiguous', 'ambiguous');
    INSERT INTO stories (mediaPk, instagramUserPk, takenAt) VALUES ('story-1', 'pk-1', 1790000000);
    INSERT INTO story_stickers (mediaPk, kind, label, sortOrder) VALUES ('story-1', 'mention', 'mention:@friend', 0);
    INSERT INTO story_locations (mediaPk, label, sortOrder) VALUES ('story-1', 'Paris', 0);
    INSERT INTO reports (key, reportName, createdAt, broadcastsCount, cacheHits, cacheMisses,
      failedCount, fetchedCount, reelsCount, storiesCount) VALUES
      ('report-1', 'report-1', '2026-10-20', 0, 0, 0, 0, 1, 1, 1),
      ('report-2', 'report-2', '2026-10-21', 0, 0, 0, 0, 1, 1, 1);
    INSERT INTO report_reels (reportKey, reelId, username, sortOrder) VALUES
      ('report-1', 'reel-1', 'traveler', 0), ('report-2', 'reel-1', 'traveler', 0);
    INSERT INTO report_stories (reportKey, reelId, mediaPk, sortOrder, status, igCaption, locations, stickers) VALUES
      ('report-1', 'reel-1', 'story-1', 0, 'ok', '', '["Paris"]', '["mention:@friend","music:Song","location:Paris"]'),
      ('report-2', 'reel-1', 'story-1', 0, 'ok', '', '["Lyon"]', '["hashtag:#trip","link:https://example.com"]'),
      ('report-2', 'reel-1', 'failed-story', 1, 'failed', '', '["Nice"]', '[]');
  `);

  cpSync(path.join(migrations, "..", "pending", latest), path.join(folder, latest), {
    recursive: true,
  });
  migrate(database, { migrationsFolder: folder });
  migrate(database, { migrationsFolder: folder });
  const summaryRows = database.$client
    .prepare("SELECT instagramUserPk, legacyUsername FROM user_summaries ORDER BY sourceHash")
    .all();
  assert.deepEqual(
    summaryRows.map((row) => ({ ...row })),
    [
      { instagramUserPk: null, legacyUsername: "ambiguous" },
      { instagramUserPk: "pk-1", legacyUsername: null },
      { instagramUserPk: null, legacyUsername: "missing-user" },
    ],
  );
  assert.equal(
    new UserSummaryRepository(database).findBySourceHash("unmatched")?.result,
    "Unmatched summary",
  );
  const reports = new ReportRepository(database);
  const first = reports.findByKey("report-1")?.manifest.users[0].stories[0];
  const second = reports.findByKey("report-2")?.manifest.users[0].stories;
  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(first.locations, ["Paris"]);
  assert.deepEqual(first.stickers, ["mention:@friend", "music:Song", "location:Paris"]);
  assert.deepEqual(second[0].locations, ["Lyon"]);
  assert.deepEqual(second[0].stickers, ["hashtag:#trip", "link:https://example.com"]);
  assert.equal(second[1].status, "failed");
  assert.deepEqual(second[1].locations, ["Nice"]);
  const story = new StoryRepository(database).findByMediaPk("story-1");
  assert.deepEqual(
    new Set(story?.story_stickers?.map((sticker) => sticker.kind)),
    new Set(["mention", "music", "hashtag", "link", "location"]),
  );
  assert.equal(
    story?.story_stickers?.filter((sticker) => sticker.label === "location:Paris").length,
    1,
  );
  assert.equal(
    database.$client.prepare("SELECT biography FROM instagram_users WHERE pk = 'pk-1'").get()
      ?.biography,
    null,
  );
  assert.equal(
    database.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'report_reels'").get(),
    undefined,
  );
  assert.equal(
    database.$client.prepare("SELECT count(*) AS count FROM report_story_groups").get()?.count,
    2,
  );
  assert.deepEqual(database.$client.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    database.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'story_locations'").get(),
    undefined,
  );
  const columns = new Set(
    database.$client
      .prepare("PRAGMA table_info(report_stories)")
      .all()
      .map((column) => column.name),
  );
  assert.equal(columns.has("stickers"), true);
  assert.equal(columns.has("locations"), true);
  assert.throws(() => {
    database.$client.exec(
      "UPDATE user_summaries SET instagramUserPk = 'missing' WHERE sourceHash = 'matched'",
    );
  }, /FOREIGN KEY/u);
  database.$client.exec("DELETE FROM reports WHERE key = 'report-1'");
  assert.equal(
    database.$client
      .prepare("SELECT count(*) AS count FROM report_story_groups WHERE reportKey = 'report-1'")
      .get()?.count,
    0,
  );
  assert.deepEqual(database.$client.prepare("PRAGMA foreign_key_check").all(), []);
});
