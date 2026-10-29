import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" },
    coverage: {
      // Count files no test loads, so untested modules lower the figure instead of vanishing.
      include: ["sdk/**", "server/**"],
      exclude: ["server/shadcn/**", "server/routeTree.gen.ts", "sdk/database/migrations/**"],
      // Raised automatically whenever coverage improves, so it can only go up.
      thresholds: {
        autoUpdate: true,
        statements: 91.04,
        branches: 85.53,
        functions: 89.63,
        lines: 90.97,
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
