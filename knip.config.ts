import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "sdk/**/*.ts",
    "tests/**/*.test.ts",
    "server/**/*.ts",
    "server/**/*.tsx",
    "scripts/**/*.ts",
    "*.config.ts",
  ],
  ignoreDependencies: [
    // Virtual module provided by SolidStart.
    "server-only",
    // Used by agents.
    "@playwright/cli",
  ],
};

export default config;
