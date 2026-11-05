import { definePlugin } from "nitro";
import { migrateDatabase } from "@@/core/domains/database/migrate.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";

export default definePlugin(() => {
  migrateDatabase(getProductionRuntime().database);
});
