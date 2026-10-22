import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: ["tests/**/*.test.ts", "*.config.ts"],
    },
    "apps/web": {
      entry: ["server/**/*.ts", "server/**/*.tsx", "*.config.ts"],
    },
    "packages/sdk": {
      entry: ["**/*.ts"],
    },
  },
  ignoreDependencies: [
    // Used by agents.
    "@playwright/cli",
  ],
};

export default config;
