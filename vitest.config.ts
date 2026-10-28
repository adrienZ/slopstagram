import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" },
    coverage: {
      // Count files no test loads, so untested modules lower the figure instead of vanishing.
      include: ["sdk/**", "server/**"],
      exclude: ["server/shadcn/**", "server/routeTree.gen.ts", "sdk/database/migrations/**"],
      thresholds: { statements: 88, branches: 82, functions: 87, lines: 88 },
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
        },
      },
    ],
  },
});
