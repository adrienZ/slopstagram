import { existsSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { snapshotDatabase } from "@@/core/database/snapshot.ts";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";
import { APP_DATABASE_PATH, APP_SNAPSHOT_PATH } from "@@/core/utils/app-data-paths.ts";

function main(): void {
  if (!existsSync(APP_DATABASE_PATH)) {
    throw new Error(`No database to snapshot at ${APP_DATABASE_PATH}`);
  }
  snapshotDatabase(getProductionRuntime().database, APP_SNAPSHOT_PATH);
  process.stdout.write(`${APP_SNAPSHOT_PATH}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
