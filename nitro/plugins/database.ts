import { definePlugin } from "nitro";
import { migrateDatabase } from "@@/core/domains/database/migrate.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import { APP_DATA_READ_ONLY } from "@@/core/utils/app-data-paths.ts";

export default definePlugin(() => {
  // A read-only deployment ships a database migrated before the deploy.
  if (APP_DATA_READ_ONLY) {
    return;
  }

  migrateDatabase(getProductionRuntime().database);
});
