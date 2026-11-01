import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" },
    // node:sqlite prints an experimental-feature notice in every worker.
    execArgv: ["--disable-warning=ExperimentalWarning"],
    coverage: {
      // Count files no test loads, so untested modules lower the figure instead of vanishing.
      include: ["sdk/**", "server/**"],
      exclude: ["server/shadcn/**", "server/routeTree.gen.ts", "sdk/database/migrations/**"],
      // Thresholds rewrite themselves upward when coverage improves, so the bar never drops.
      thresholds: {
        // Floor to whole percents: just under the measured value, so tiny fluctuations never fail.
        autoUpdate: (value) => Math.floor(value),
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
    // Keep server/SQLite tests in Node and browser UI tests in jsdom with their own setup.
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["tests/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/ui/setup.ts"],
          globalSetup: ["./tests/ui/global-setup.ts"],
        },
      },
    ],
  },
});
