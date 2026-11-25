import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" },
    // node:sqlite prints an experimental-feature notice in every worker.
    execArgv: ["--disable-warning=ExperimentalWarning"],
    coverage: {
      // Count files no test loads, so untested modules lower the figure instead of vanishing.
      // The fixtures capture script is tested through its exports, so Sonar needs its lcov entry.
      include: ["core/**", "app/**", "nitro/**", "scripts/fixtures-capture.ts"],
      // Canvas adapters draw through WebGL or a 2D canvas, which jsdom lacks: tests swap them out.
      exclude: [
        "app/shadcn/**",
        "app/routeTree.gen.ts",
        "core/domains/database/migrations/**",
        "app/components/*-canvas.tsx",
      ],
      // Thresholds rewrite themselves upward when coverage improves, so the bar never drops.
      thresholds: {
        // Floor to whole percents: just under the measured value, so tiny fluctuations never fail.
        autoUpdate: (value) => Math.floor(value),
        statements: 94,
        branches: 88,
        functions: 94,
        lines: 93,
      },
    },
    // Keep server/SQLite tests in Node and browser UI tests in jsdom with their own setup.
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "ui",
          // Vite resolves dynamic imports when transforming for jsdom, and Linux lacks `mac-ocr`.
          alias: {
            "mac-ocr": fileURLToPath(new URL("test/ui/mac-ocr.test-utils.ts", import.meta.url)),
          },
          environment: "jsdom",
          include: ["test/**/*.test.tsx"],
          setupFiles: ["./test/ui/setup.ts"],
        },
      },
    ],
  },
});
