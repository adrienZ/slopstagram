import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignore: [".agents/**"],
  entry: [
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
