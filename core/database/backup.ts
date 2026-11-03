import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DrizzleDatabase } from "./client.ts";

/** Copies the database, consistently even while it is in use, to a file named after the time. */
export function backupDatabase(database: DrizzleDatabase, directory: string, now: Date): void {
  mkdirSync(directory, { recursive: true });
  const timestamp = now.toISOString().replaceAll(/[-:.]/gu, "");
  database.$client
    .prepare("VACUUM INTO ?")
    .run(path.join(directory, `slopstagram-${timestamp}.sqlite`));
}
