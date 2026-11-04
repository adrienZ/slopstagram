import { defineConfig } from "evalite/config";

// `npm run eval` runs evals/*.eval.ts against the local Ollama server. See AGENTS.md.
export default defineConfig({
  // A local model answers one request at a time: parallel runs would only queue and time out.
  maxConcurrency: 1,
  testTimeout: 300_000,
  viteConfig: {
    resolve: { tsconfigPaths: true },
    // The evals seed their own in-memory world; nothing may open the application database.
    test: { env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" } },
  },
});
