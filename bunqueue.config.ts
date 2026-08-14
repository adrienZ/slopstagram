import type { BunqueueConfig } from "bunqueue";

export default {
  backup: {
    enabled: false,
  },

  storage: {
    // hardcoded value expected by dashboard UI
    dataPath: "./data/bunq.db",
  },
} satisfies BunqueueConfig;
