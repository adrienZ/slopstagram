import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { APP_DATABASE_PATH } from "../lib/app-data-paths.ts";

export type DrizzleDatabase = ReturnType<typeof drizzle>;

export function createDrizzle(filename: string): DrizzleDatabase {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

  return drizzle({ client: sqlite });
}

const database = createDrizzle(APP_DATABASE_PATH);

export function useDrizzle(): DrizzleDatabase {
  return database;
}
