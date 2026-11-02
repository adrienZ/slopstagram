import path from "node:path";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { type DrizzleDatabase, useDrizzle } from "./client.ts";

const migrationsFolder = path.join(import.meta.dirname, "migrations");

export function migrateDatabase(database: DrizzleDatabase = useDrizzle()): void {
  migrate(database, { migrationsFolder });
}
