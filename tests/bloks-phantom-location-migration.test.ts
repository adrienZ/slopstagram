import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "vitest";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";

const phantomMigration = "20261027130902_remove_bloks_phantom_locations";
const migrations = fileURLToPath(new URL("../sdk/database/migrations", import.meta.url));

test("phantom bloks place migration removes only the fake places and their observations", (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "bloks-phantom-migration-"));
  const database = createDrizzle(":memory:");
  context.onTestFinished(() => {
    database.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });
  for (const entry of readdirSync(migrations)) {
    if (entry < phantomMigration) {
      cpSync(path.join(migrations, entry), path.join(directory, entry), { recursive: true });
    }
  }
  migrate(database, { migrationsFolder: directory });
  database.$client.exec(`
    INSERT INTO stories (mediaPk) VALUES ('s1'), ('s2');
    INSERT INTO metadata_location_partial (id, instagramPlaceId)
    VALUES ('phantom-partial', 'bloks_sticker_id'), ('real-partial', 'real-partial-place');
    INSERT INTO metadata_location (id, instagramPlaceId, name, latitude, longitude)
    VALUES ('phantom-usable', 'bloks_sticker_id', 'Fake', 1, 2),
      ('real-usable', 'real-usable-place', 'Paris', 48, 2);
    INSERT INTO story_location_observations
      (id, mediaPk, source, sortOrder, providerOccurrenceId, locationId, partialLocationId)
    VALUES
      ('o1', 's1', 'story_bloks_stickers', 0, 'a', NULL, 'phantom-partial'),
      ('o2', 's2', 'story_bloks_stickers', 0, 'b', NULL, 'phantom-partial'),
      ('o3', 's2', 'story_bloks_stickers', 1, 'c', 'phantom-usable', NULL),
      ('o4', 's1', 'story_locations', 0, 'd', 'real-usable', NULL),
      ('o5', 's2', 'story_locations', 1, 'e', NULL, 'real-partial');
  `);

  migrateDatabase(database);

  assert.deepEqual(
    database.$client
      .prepare("SELECT id FROM story_location_observations ORDER BY id")
      .all()
      .map(({ id }) => id),
    ["o4", "o5"],
  );
  assert.deepEqual(
    database.$client
      .prepare("SELECT instagramPlaceId FROM metadata_location_partial")
      .all()
      .map(({ instagramPlaceId }) => instagramPlaceId),
    ["real-partial-place"],
  );
  assert.deepEqual(
    database.$client
      .prepare("SELECT instagramPlaceId FROM metadata_location")
      .all()
      .map(({ instagramPlaceId }) => instagramPlaceId),
    ["real-usable-place"],
  );
  assert.equal(database.$client.prepare("SELECT count(*) AS n FROM stories").get()?.n, 2);
  assert.deepEqual(database.$client.prepare("PRAGMA foreign_key_check").all(), []);
});
