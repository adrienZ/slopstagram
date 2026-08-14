import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { definePlugin } from "nitro";
import { useDrizzle } from "../../sdk/database/client.ts";

export default definePlugin(() => {
  migrate(useDrizzle(), {
    // oxlint-disable-next-line unicorn/prefer-import-meta-properties -- This traversal works from source and bundled Nitro output.
    migrationsFolder: resolve(fileURLToPath(import.meta.url), "../../../sdk/database/migrations"),
  });
});
