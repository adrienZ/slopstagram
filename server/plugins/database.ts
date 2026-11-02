import { definePlugin } from "nitro";
import { migrateDatabase } from "@@/core/database/migrate.ts";

export default definePlugin(() => {
  migrateDatabase();
});
