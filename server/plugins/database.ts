import { definePlugin } from "nitro";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";

export default definePlugin(() => {
  migrateDatabase(getProductionRuntime().database);
});
