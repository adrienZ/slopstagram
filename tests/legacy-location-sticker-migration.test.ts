import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test, type TestContext } from "vitest";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";

const linkMigration = "20261028111029_link_legacy_location_stickers";
const migrations = fileURLToPath(new URL("../sdk/database/migrations", import.meta.url));

function createDatabaseBefore(context: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "legacy-location-sticker-migration-"));
  const database = createDrizzle(":memory:");
  context.onTestFinished(() => {
    database.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });
  for (const entry of readdirSync(migrations)) {
    if (entry < linkMigration) {
      cpSync(path.join(migrations, entry), path.join(directory, entry), { recursive: true });
    }
  }
  migrate(database, { migrationsFolder: directory });
  database.$client.exec(`
    INSERT INTO metadata_location (id, instagramPlaceId, name, address)
    VALUES ('place', '1', 'Anse De Maldormé', 'Anse de Maldormé'),
           ('other', '2', 'Chez Paul', '1 Rue des Halles');
    INSERT INTO stories (mediaPk) VALUES ('legacy'), ('observed'), ('claimed'), ('different');
  `);
  return database;
}

function addStickers(
  database: ReturnType<typeof createDatabaseBefore>,
  rows: Array<[string, string, string, string, number]>,
) {
  const insert = database.$client.prepare(
    "INSERT INTO story_stickers (occurrenceId, mediaPk, kind, label, sortOrder, source) VALUES (?, ?, 'location', ?, ?, ?)",
  );
  for (const [occurrenceId, mediaPk, label, source, sortOrder] of rows) {
    insert.run(occurrenceId, mediaPk, label, sortOrder, source);
  }
}

function addObservations(
  database: ReturnType<typeof createDatabaseBefore>,
  rows: Array<[string, string, string, string | null]>,
) {
  const insert = database.$client.prepare(
    "INSERT INTO story_location_observations (id, mediaPk, source, sortOrder, locationId, occurrenceId) VALUES (?, ?, 'story_locations', 0, ?, ?)",
  );
  for (const [id, mediaPk, locationId, occurrenceId] of rows) {
    insert.run(id, mediaPk, locationId, occurrenceId);
  }
}

function stickerLabels(database: ReturnType<typeof createDatabaseBefore>, mediaPk: string) {
  return database.$client
    .prepare("SELECT label FROM story_stickers WHERE mediaPk = ? ORDER BY sortOrder")
    .all(mediaPk)
    .map((row) => row.label);
}

function linkedLabel(database: ReturnType<typeof createDatabaseBefore>, mediaPk: string) {
  return database.$client
    .prepare(
      "SELECT s.label FROM story_location_observations o JOIN story_stickers s ON s.occurrenceId = o.occurrenceId WHERE o.mediaPk = ?",
    )
    .get(mediaPk)?.label;
}

test("an older sticker showing the place by its name is linked and the added sticker is dropped", (context) => {
  const database = createDatabaseBefore(context);
  addStickers(database, [
    ["old-1", "legacy", "Anse De Maldormé", "unknown", 0],
    ["old-2", "observed", "Anse De Maldormé ", "unknown", 0],
    ["old-3", "claimed", "Anse De Maldormé", "unknown", 0],
    ["old-4", "different", "Chez Paul", "unknown", 0],
    ["obs-legacy", "legacy", "Anse De Maldormé, Anse de Maldormé", "story_locations", 1],
    ["obs-observed", "observed", "Anse De Maldormé, Anse de Maldormé", "story_locations", 1],
    ["obs-claimed", "claimed", "Anse De Maldormé, Anse de Maldormé", "story_locations", 1],
    ["obs-different", "different", "Anse De Maldormé, Anse de Maldormé", "story_locations", 1],
  ]);
  addObservations(database, [
    ["obs-legacy", "legacy", "place", "obs-legacy"],
    ["obs-observed", "observed", "place", "obs-observed"],
    ["obs-claimed", "claimed", "place", "obs-claimed"],
    ["obs-different", "different", "place", "obs-different"],
    ["other-claim", "claimed", "other", "old-3"],
  ]);

  migrateDatabase(database);

  assert.deepEqual(stickerLabels(database, "legacy"), ["Anse De Maldormé"]);
  assert.equal(linkedLabel(database, "legacy"), "Anse De Maldormé");
  assert.deepEqual(stickerLabels(database, "observed"), ["Anse De Maldormé "]);
  // An older sticker another observation already claims stays where it is.
  assert.deepEqual(stickerLabels(database, "claimed"), [
    "Anse De Maldormé",
    "Anse De Maldormé, Anse de Maldormé",
  ]);
  // A sticker naming another place is not this place's sticker.
  assert.deepEqual(stickerLabels(database, "different"), [
    "Chez Paul",
    "Anse De Maldormé, Anse de Maldormé",
  ]);
  assert.equal(linkedLabel(database, "different"), "Anse De Maldormé, Anse de Maldormé");
});
