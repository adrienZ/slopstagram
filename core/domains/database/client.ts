import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";

export type DrizzleDatabase = ReturnType<typeof drizzle>;

export interface DrizzleOptions {
  readOnly?: boolean;
}

// No WAL: a single-file database can be shipped and opened where the filesystem is read-only.
export function createDrizzle(filename: string, options: DrizzleOptions = {}): DrizzleDatabase {
  const readOnly = options.readOnly ?? false;

  if (filename !== ":memory:" && !readOnly) {
    mkdirSync(path.dirname(filename), { recursive: true });
  }

  const sqlite = new DatabaseSync(filename, { readOnly });
  sqlite.exec("PRAGMA busy_timeout = 5000;");

  return drizzle({ client: sqlite });
}
