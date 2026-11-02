import { readdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { expect, test } from "vitest";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { createTestDatabase } from "./test-database.ts";

const migrationsFolder = fileURLToPath(new URL("../sdk/database/migrations", import.meta.url));
// Each migration is a folder, so loose files next to them are not counted.
const migrationCount = readdirSync(migrationsFolder, { withFileTypes: true }).filter((entry) =>
  entry.isDirectory(),
).length;

function columnsOf(database: ReturnType<typeof createTestDatabase>, table: string): Array<string> {
  return database.$client
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(({ name }) => String(name));
}

test("migrating an empty database applies every migration, leaves a consistent schema and can be repeated", (context) => {
  const database = createTestDatabase(context);

  migrateDatabase(database);

  const applied = database.$client
    .prepare("SELECT count(*) AS count FROM __drizzle_migrations")
    .get();
  expect(applied?.count).toBe(migrationCount);
  expect(database.$client.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  // Columns that later migrations dropped stay gone.
  expect(columnsOf(database, "report_stories")).not.toContain("igCaption");
  expect(columnsOf(database, "reports")).not.toContain("cacheHits");
  expect(columnsOf(database, "fetch_runs")).not.toContain("cacheMisses");
  expect(columnsOf(database, "metadata_music")).toContain("audioCachePath");
});
