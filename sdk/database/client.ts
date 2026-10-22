import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { APP_DATABASE_PATH } from "../lib/app-data-paths.ts";

export type DrizzleDatabase = ReturnType<typeof drizzle>;

export function createDrizzle(filename: string): DrizzleDatabase {
  if (filename !== ":memory:") {
    mkdirSync(path.dirname(filename), { recursive: true });
  }

  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");

  return drizzle({ client: sqlite });
}

// Keep the default connection in memory in Node test workers.
const database = createDrizzle(
  process.env.NODE_TEST_CONTEXT === undefined ? APP_DATABASE_PATH : ":memory:",
);

export function useDrizzle(): DrizzleDatabase {
  return database;
}
