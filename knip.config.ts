import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignore: ["server/shadcn/**", "server/routeTree.gen.ts"],
  // Only real entry points: listing every module as an entry hides unused files and exports.
  // Entries marked with `!` are production entries, so `knip --production` reports code
  // that only tests keep alive.
  entry: [
    "scripts/*.ts!",
    "server/entry-server.tsx!",
    "server/router.tsx!",
    "server/pages/**/*.tsx!",
    "server/plugins/*.ts!",
    "server/routes/**/*.ts!",
    "tests/**/*.test.ts",
    "tests/**/*.test.tsx",
    "oxlint/plugins/**/*.ts",
    "*.config.ts",
  ],
  project: [
    "sdk/**/*.ts!",
    "server/**/*.{ts,tsx,css}!",
    "scripts/**/*.ts!",
    "tests/**/*.{ts,tsx}",
    "oxlint/**/*.ts",
  ],
  ignoreDependencies: [
    // Used by agents.
    "@playwright/cli",
  ],
};

export default config;
