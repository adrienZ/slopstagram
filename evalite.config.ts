import process from "node:process";
import { defineConfig } from "evalite/config";
import { configDefaults } from "vitest/config";
import { createSqliteStorage } from "evalite/sqlite-storage";

// `npm run eval` runs evals/*.eval.ts against the local Ollama server. See AGENTS.md.
export default defineConfig({
  // The run fails when the average score of every scorer (0-100) is under this: the baseline of the
  // default chat model (qwen3.5:0.8b). Raise it when the model improves.
  scoreThreshold: 75,
  // Evalite applies one timeout to a whole case, queue and judge included, and the cases of an eval
  // file wait for each other (see `askAssistant` in evals/assistant-world.ts). A CPU runner answers in about 17
  // seconds a case, so 5 minutes timed out the last 13 cases there: it gets 15 minutes. A local run
  // takes about 1 minute, so a stuck one fails after 5.
  testTimeout: process.env.CI === undefined ? 300_000 : 900_000,
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
