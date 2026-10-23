import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" },
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
    coverage: {
      provider: "v8",
      include: ["sdk/**/*.ts", "server/**/*.ts", "server/**/*.tsx"],
      exclude: ["server/shadcn/**", "server/routeTree.gen.ts", "server/assets/**"],
      reporter: ["text", "json", "lcov"],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
        "server/components/**": { statements: 95, branches: 90, functions: 100, lines: 95 },
        "server/hooks/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "server/theme.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
