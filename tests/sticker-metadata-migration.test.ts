import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";

test("migration merges matching partial metadata, preserves links, and clears invalid values", (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "sticker-migration-"));
  const source = fileURLToPath(new globalThis.URL("../sdk/database/migrations", import.meta.url));
  for (const name of readdirSync(source)) {
    if (name < "20261027130000_unify_sticker_metadata") {
      cpSync(path.join(source, name), path.join(directory, name), { recursive: true });
    }
  }
  const db = createDrizzle(":memory:");
  context.onTestFinished(() => {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });
  migrate(db, { migrationsFolder: directory });
  db.$client.exec("PRAGMA foreign_keys = ON");
  db.$client.exec(`
    INSERT INTO stories (mediaPk) VALUES ('s');
    INSERT INTO metadata_location (id, instagramPlaceId, name, latitude, longitude) VALUES ('l1', 'place', 'Known', 1, 2);
    INSERT INTO metadata_location_partial (id, instagramPlaceId, name, address, latitude) VALUES ('l2', 'place', 'Old', 'Address', 999);
    INSERT INTO metadata_location_partial (id, latitude, longitude, name) VALUES ('l3', 999, 3, '   ');
    INSERT INTO story_location_observations (id, mediaPk, source, sortOrder, partialLocationId) VALUES ('ol', 's', 'source', 0, 'l2'), ('ol2', 's', 'source', 1, 'l3');
    INSERT INTO story_location_observations (id, mediaPk, source, sortOrder, locationId) VALUES ('ol3', 's', 'source', 2, 'l1');
    INSERT INTO metadata_music (id, instagramAudioAssetId, title, artist) VALUES ('m1', 'audio', 'Known', 'Artist');
    INSERT INTO metadata_music_partial (id, instagramAudioAssetId, title, durationMs, audioSourceUrl, audioState) VALUES ('m2', 'audio', 'Old', 123, 'https://example.com/audio', 'failed');
    INSERT INTO metadata_music_partial (id, instagramAudioAssetId, title, durationMs) VALUES ('m3', '  ', '  ', -1);
    INSERT INTO story_music_observations (id, mediaPk, source, sortOrder, partialMusicId) VALUES ('om', 's', 'source', 0, 'm2'), ('om2', 's', 'source', 1, 'm3');
    INSERT INTO story_music_observations (id, mediaPk, source, sortOrder, musicId) VALUES ('om3', 's', 'source', 2, 'm1');
  `);
  migrateDatabase(db);
  assert.deepEqual(
    { ...db.$client.prepare("SELECT name, address FROM metadata_location WHERE id='l1'").get() },
    { name: "Known", address: "Address" },
  );
  assert.deepEqual(
    {
      ...db.$client
        .prepare("SELECT latitude, longitude, name FROM metadata_location WHERE id='l3'")
        .get(),
    },
    { latitude: null, longitude: 3, name: null },
  );
  assert.equal(
    db.$client.prepare("SELECT locationId FROM story_location_observations WHERE id='ol'").get()
      ?.locationId,
    "l1",
  );
  assert.deepEqual(
    {
      ...db.$client
        .prepare("SELECT title, durationMs, audioState FROM metadata_music WHERE id='m1'")
        .get(),
    },
    { title: "Known", durationMs: 123, audioState: "failed" },
  );
  assert.deepEqual(
    {
      ...db.$client
        .prepare(
          "SELECT instagramAudioAssetId, title, durationMs FROM metadata_music WHERE id='m3'",
        )
        .get(),
    },
    { instagramAudioAssetId: null, title: null, durationMs: null },
  );
  assert.equal(
    db.$client.prepare("SELECT musicId FROM story_music_observations WHERE id='om'").get()?.musicId,
    "m1",
  );
  assert.throws(() => {
    db.$client.exec("UPDATE metadata_location SET latitude=100 WHERE id='l1'");
  });
  assert.throws(() => {
    db.$client.exec("UPDATE metadata_music SET title='  ' WHERE id='m1'");
  });
  assert.equal(
    db.$client.prepare("SELECT locationId FROM story_location_observations WHERE id='ol3'").get()
      ?.locationId,
    "l1",
  );
  assert.equal(
    db.$client.prepare("SELECT musicId FROM story_music_observations WHERE id='om3'").get()
      ?.musicId,
    "m1",
  );
  assert.equal(db.$client.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
  assert.deepEqual(db.$client.prepare("PRAGMA foreign_key_check").all(), []);
  migrateDatabase(db);
});
