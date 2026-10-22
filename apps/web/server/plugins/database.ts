import { definePlugin } from "nitro";
import { migrateDatabase } from "@slopstagram/sdk/database/migrate.ts";

export default definePlugin(() => {
  migrateDatabase();
});
