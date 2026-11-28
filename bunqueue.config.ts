import { defineConfig } from "bunqueue";
import { APP_BUNQUEUE_PATH } from "./core/utils/app-data-paths.ts";

export default defineConfig({
  backup: {
    enabled: false,
  },

  storage: {
    dataPath: APP_BUNQUEUE_PATH,
  },
});
