import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "app/entry-client.tsx",
    "sdk/**/*.ts",
    "tests/**/*.test.ts",
    "server/**/*.ts",
    "server/**/*.tsx",
    "scripts/**/*.ts",
    "*.config.ts",
  ],
  ignoreDependencies: [
    // Used by agents.
    "@playwright/cli",
  ],
};

export default config;
