import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DrizzleDatabase } from "./client.ts";

/** Consistent even while the database is in use. */
export function createDatabaseBackup(database: DrizzleDatabase, directory: string) {
  return (at: Date): void => {
    mkdirSync(directory, { recursive: true });
    const timestamp = at.toISOString().replaceAll(/[-:.]/gu, "");
    database.$client
      .prepare("VACUUM INTO ?")
      .run(path.join(directory, `slopstagram-${timestamp}.sqlite`));
  };
}
