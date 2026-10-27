import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryItemSchema } from "../sdk/lib/story-schemas.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";

test("migration recovers only proven sticker sources and keeps older cached stories usable", async (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "sticker-sources-"));
  const source = fileURLToPath(new globalThis.URL("../sdk/database/migrations", import.meta.url));
  for (const name of readdirSync(source)) {
    if (name < "20261027140000_remove_sticker_sources") {
      cpSync(path.join(source, name), path.join(directory, name), { recursive: true });
    }
  }
  const db = createDrizzle(":memory:");
  context.onTestFinished(() => {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });
  migrate(db, { migrationsFolder: directory });
  db.$client.exec(`
    PRAGMA foreign_keys = ON;
    INSERT INTO stories (mediaPk) VALUES ('s'), ('other');
    INSERT INTO story_stickers (occurrenceId, mediaPk, sortOrder, kind, label, source) VALUES
      ('certain', 's', 0, 'location', 'Paris', 'unknown'),
      ('ambiguous', 's', 1, 'location', 'Lyon', 'unknown'),
      ('unlinked', 's', 2, 'music', 'Song', 'unknown'),
      ('known', 's', 3, 'music', 'Known', 'story_music_stickers'),
      ('foreign', 'other', 0, 'location', 'Other', 'unknown');
    INSERT INTO story_sticker_sources (mediaPk, source) VALUES ('s', 'story_locations'), ('s', 'story_music_stickers');
    INSERT INTO metadata_location (id, name) VALUES ('l', 'Place');
    INSERT INTO story_location_observations (id, mediaPk, source, sortOrder, occurrenceId, locationId) VALUES
      ('o1','s','story_locations',0,'certain','l'),
      ('o2','s','story_locations',1,'ambiguous','l'),
      ('o3','s','story_bloks_stickers',2,'ambiguous','l'),
      ('o4','s','story_locations',3,'foreign','l');
  `);
  migrateDatabase(db);
  const rows = db.$client
    .prepare("SELECT occurrenceId, source FROM story_stickers ORDER BY occurrenceId")
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    { occurrenceId: "ambiguous", source: "unknown" },
    { occurrenceId: "certain", source: "story_locations" },
    { occurrenceId: "foreign", source: "unknown" },
    { occurrenceId: "known", source: "story_music_stickers" },
    { occurrenceId: "unlinked", source: "unknown" },
  ]);
  assert.equal(
    db.$client
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='story_sticker_sources'",
      )
      .get()?.n,
    0,
  );
  assert.deepEqual(db.$client.prepare("PRAGMA foreign_key_check").all(), []);
  const repository = new StoryRepository(db);
  const before = repository.findByMediaPk("s");
  assert.ok(before?.annotations);
  const oldCache = StoryItemSchema.parse({
    ...before,
    annotations: {
      ...before.annotations,
      sources: ["story_locations"],
      stickers: before.annotations.stickers.map((sticker) =>
        sticker.occurrenceId === "certain" ? { ...sticker, source: "unknown" } : sticker,
      ),
    },
  });
  await repository.save(oldCache);
  const after = repository.findByMediaPk("s");
  assert.equal(
    after?.annotations?.stickers.find((sticker) => sticker.occurrenceId === "certain")?.source,
    "story_locations",
  );
  assert.ok(!Object.hasOwn(after.annotations ?? {}, "sources"));
});
