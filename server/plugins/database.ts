import { definePlugin } from "nitro";
import { migrateDatabase } from "../../sdk/database/migrate.ts";

export default definePlugin(() => {
  migrateDatabase();
});
