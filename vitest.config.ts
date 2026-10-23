import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" } },
});
