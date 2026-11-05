import { defineConfig } from "evalite/config";
import { createSqliteStorage } from "evalite/sqlite-storage";

// `npm run eval` runs evals/*.eval.ts against the local Ollama server. See AGENTS.md.
export default defineConfig({
  // The run fails when the average score of every scorer (0-100) is under this: the baseline of the
  // default chat model (qwen3.5:0.8b). Raise it when the model improves.
  scoreThreshold: 75,
  // The wide table wraps badly: read the answers in `npm run eval:export`, or in
  // `evalite-export/last-run.json`, which `npm run eval` writes.
  hideTable: true,
  // Evalite applies one timeout to a whole case, queue and judge included, and the 30 cases wait for
  // each other (see `askAssistant` in evals/assistant-world.ts): sized for the whole run on a CPU
  // runner, which answers in about 17 seconds a case, so 5 minutes timed out the last 13 cases.
  testTimeout: 900_000,
  // Kept on disk so `npm run eval:export` renders the run that `npm run eval` just made instead of
  // running the evals again. Needs `better-sqlite3`, the one SQLite driver Evalite supports.
  storage: async () => await createSqliteStorage("./data/evalite.db"),
  viteConfig: {
    resolve: { tsconfigPaths: true },
    // The evals seed their own in-memory world; nothing may open the application database.
    test: { env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" } },
  },
});
