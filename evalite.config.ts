import process from "node:process";
import { defineConfig } from "evalite/config";
import { configDefaults } from "vitest/config";
import { createSqliteStorage } from "evalite/sqlite-storage";

// `npm run eval` runs evals/*.eval.ts against the local Ollama server. See AGENTS.md.
export default defineConfig({
  // The run fails when the average score of every scorer (0-100) is under this: the baseline of the
  // default chat model (qwen3.5:0.8b). Raise it when the model improves.
  scoreThreshold: 75,
  // A case's timeout starts with the case, and the cases of a file queue behind the one chat model
  // (`askAssistant`), so concurrent cases would count the whole queue against it. CI has no judge
  // to overlap with: it starts one case at a time.
  testTimeout: 300_000,
  maxConcurrency: process.env.CI === undefined ? undefined : 1,
  // Kept on disk so `npm run eval:export` renders the run that `npm run eval` just made instead of
  // running the evals again. Needs `better-sqlite3`, the one SQLite driver Evalite supports.
  storage: async () => await createSqliteStorage("./data/evalite.db"),
  viteConfig: {
    resolve: { tsconfigPaths: true },
    // The evals seed their own in-memory world; nothing may open the application database.
    test: {
      env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" },
      // Worktrees under .claude/ hold copies of the evals: running them too doubles the run.
      exclude: [...configDefaults.exclude, ".claude/**"],
    },
  },
});
