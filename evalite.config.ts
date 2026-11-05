import { defineConfig } from "evalite/config";

// `npm run eval` runs evals/*.eval.ts against the local Ollama server. See AGENTS.md.
export default defineConfig({
  // The run fails when the average score of every scorer (0-100) is under this: the baseline of the
  // default chat model (qwen3.5:0.8b). Raise it when the model improves.
  scoreThreshold: 75,
  // The wide table wraps badly: read the answers in `npm run eval:export`, or in
  // `evalite-export/last-run.json`, which `npm run eval` writes.
  hideTable: true,
  // Evalite applies one timeout to a whole case, queue and judge included: sized for the slow local
  // chat model, whose calls wait for each other (see `inSequence` in evals/assistant-world.ts).
  testTimeout: 300_000,
  viteConfig: {
    resolve: { tsconfigPaths: true },
    // The evals seed their own in-memory world; nothing may open the application database.
    test: { env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" } },
  },
});
