import path from "node:path";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { SDK_PACKAGE_DIR } from "../lib/app-data-paths.ts";
import { type DrizzleDatabase, useDrizzle } from "./client.ts";

const migrationsFolder = path.join(SDK_PACKAGE_DIR, "database/migrations");

export function migrateDatabase(database: DrizzleDatabase = useDrizzle()): void {
  migrate(database, { migrationsFolder });
}
