import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";

/** Copies the database, consistently even while it is in use, to a file named after the time. */
export function createDatabaseBackup(database: DrizzleDatabase, directory: string) {
  return (at: Date): void => {
    mkdirSync(directory, { recursive: true });
    const timestamp = at.toISOString().replaceAll(/[-:.]/gu, "");
    database.$client
      .prepare("VACUUM INTO ?")
      .run(path.join(directory, `slopstagram-${timestamp}.sqlite`));
  };
}
