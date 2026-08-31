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
    // Used by agents.
    "@playwright/cli",
  ],
  ignore: [".agents/skills/install-anti-slop/**"],
};

export default config;
