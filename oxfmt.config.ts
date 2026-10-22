import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [
    ".agents/",
    "AGENTS.md",
    ".vscode",
    "tests/fixtures/",
    "audit.json",
    ".nitro",
    "apps/web/.nitro/",
    "apps/web/.output/",
    "apps/web/.tanstack/",
    "apps/web/server/routeTree.gen.ts",
  ],
});
