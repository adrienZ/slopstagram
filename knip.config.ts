import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "tests/**/*.test.ts",
    "server/**/*.ts",
    "server/**/*.tsx",
    "scripts/**/*.ts",
  ],
  ignoreBinaries: ["mac-ocr"],
  ignoreDependencies: [
    "@playwright/cli", // used by agents
  ]
};

export default config;
