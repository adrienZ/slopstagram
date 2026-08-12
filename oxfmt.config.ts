import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [".agents/", "AGENTS.md", ".vscode", "tests/fixtures/", "audit.json", ".nitro"],
});
