import { definePlugin } from "nitro";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";
import { APP_BACKUPS_DIR } from "@@/core/utils/app-data-paths.ts";

export default definePlugin(() => {
  migrateDatabase(getProductionRuntime().database, { backupDirectory: APP_BACKUPS_DIR });
});
