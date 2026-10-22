import { defineConfig } from "bunqueue";

export default defineConfig({
  backup: {
    enabled: false,
  },

  storage: {
    // hardcoded value expected by dashboard UI
    dataPath: "./data/bunq.db",
  },
});
