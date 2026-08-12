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
  ignoreBinaries: ["mac-ocr"],
  ignoreDependencies: [
    // Used by agents.
    "@playwright/cli",
  ],
};

export default config;
