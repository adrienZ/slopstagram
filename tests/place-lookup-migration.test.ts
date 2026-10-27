import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";

test("place lookup backfill dates existing places by their earliest story", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE metadata_location (id TEXT, lastLookupAttemptAt INTEGER); CREATE TABLE stories (mediaPk TEXT, takenAt INTEGER); CREATE TABLE story_location_observations (mediaPk TEXT, locationId TEXT)",
    );
    db.exec(`
      INSERT INTO metadata_location VALUES ('shared', NULL), ('undated', NULL), ('orphan', NULL), ('looked-up', 5);
      INSERT INTO stories VALUES ('late', 2000), ('early', 1000), ('no-date', NULL);
      INSERT INTO story_location_observations VALUES
        ('late', 'shared'), ('early', 'shared'), ('no-date', 'undated'), ('early', 'looked-up')
    `);
    db.exec(
      readFileSync(
        new globalThis.URL(
          "../sdk/database/migrations/20261027155752_backfill_place_lookup_attempt/migration.sql",
          import.meta.url,
        ),
        "utf-8",
      ),
    );
    const attempts = new Map<unknown, unknown>();
    for (const row of db.prepare("SELECT id, lastLookupAttemptAt FROM metadata_location").all()) {
      attempts.set(row.id, row.lastLookupAttemptAt);
    }
    assert.deepEqual(
      attempts,
      new Map<unknown, unknown>([
        ["shared", 1_000_000],
        ["undated", null],
        ["orphan", null],
        ["looked-up", 5],
      ]),
    );
  } finally {
    db.close();
  }
});
