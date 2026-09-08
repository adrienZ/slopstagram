import path from "node:path";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { definePlugin } from "nitro";
import { useDrizzle } from "../../sdk/database/client.ts";

export default definePlugin(() => {
  migrate(useDrizzle(), {
    migrationsFolder: path.resolve(import.meta.filename, "../../../sdk/database/migrations"),
  });
});
