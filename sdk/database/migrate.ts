import { fileURLToPath, URL } from "node:url";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { type DrizzleDatabase, useDrizzle } from "./client.ts";

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

export function migrateDatabase(database: DrizzleDatabase = useDrizzle()): void {
  migrate(database, { migrationsFolder });
}
