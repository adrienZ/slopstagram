import path from "node:path";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";

const migrationsFolder = path.join(import.meta.dirname, "migrations");

export function migrateDatabase(database: DrizzleDatabase): void {
  migrate(database, { migrationsFolder });
}
