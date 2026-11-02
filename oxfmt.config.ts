import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [
    ".agents/",
    ".claude/",
    "AGENTS.md",
    ".vscode",
    "tests/fixtures/",
    "audit.json",
    ".nitro",
    "app/routeTree.gen.ts",
    "app/shadcn/**",
  ],
});
