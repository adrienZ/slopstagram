import path from "node:path";
import { defineConfig } from "bunqueue";
import { APP_DATA_DIR } from "./lib/app-data-paths.ts";

export default defineConfig({
  backup: {
    enabled: false,
  },

  storage: {
    // hardcoded value expected by dashboard UI
    dataPath: path.join(APP_DATA_DIR, "bunq.db"),
  },
});
