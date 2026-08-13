import type { BunqueueConfig } from "bunqueue/client";

export default {
  backup: {
    enabled: false,
  },

  storage: {
    dataPath: "./.data/bunqueue.db",
  },
} satisfies BunqueueConfig;
