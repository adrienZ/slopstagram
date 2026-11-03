import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { DrizzleDatabase } from "./client.ts";
import { snapshotDatabase } from "./snapshot.ts";

/** One day of hourly fetch runs. */
const DEFAULT_BACKUPS_KEPT = 24;
const BACKUP_FILE_PATTERN = /^slopstagram-\d{8}T\d{9}Z\.sqlite$/u;

/** Writes a timestamped copy of the database, then deletes all but the most recent backups. */
export function backupDatabase(
  database: DrizzleDatabase,
  directory: string,
  options: { keep?: number; now?: Date } = {},
): void {
  const timestamp = (options.now ?? new Date()).toISOString().replaceAll(/[-:.]/gu, "");
  snapshotDatabase(database, path.join(directory, `slopstagram-${timestamp}.sqlite`));

  // The timestamps sort chronologically.
  const backups = readdirSync(directory)
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .toSorted();
  for (const name of backups.slice(
    0,
    Math.max(0, backups.length - (options.keep ?? DEFAULT_BACKUPS_KEPT)),
  )) {
    rmSync(path.join(directory, name));
  }
}
