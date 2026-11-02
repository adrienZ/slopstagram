import { cp } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  routeRules: {
    "/": { redirect: "/report" },
  },
  hooks: {
    // migrateDatabase reads the SQL files from a folder next to the bundled server entry, and the
    // bundler only follows imports, so the migrations are copied by hand.
    compiled: async (nitro) => {
      await cp(
        path.join(nitro.options.rootDir, "core/database/migrations"),
        path.join(nitro.options.output.serverDir, "migrations"),
        { recursive: true },
      );
    },
  },
});
