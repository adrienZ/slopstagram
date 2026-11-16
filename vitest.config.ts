import { fileURLToPath, URL } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: { SLOPSTAGRAM_DATABASE_PATH: ":memory:" },
    // node:sqlite prints an experimental-feature notice in every worker.
    execArgv: ["--disable-warning=ExperimentalWarning"],
    coverage: {
      // Count files no test loads, so untested modules lower the figure instead of vanishing.
      include: ["core/**", "app/**", "nitro/**"],
      exclude: ["app/shadcn/**", "app/routeTree.gen.ts", "core/domains/database/migrations/**"],
      // Thresholds rewrite themselves upward when coverage improves, so the bar never drops.
      thresholds: {
        // Floor to whole percents: just under the measured value, so tiny fluctuations never fail.
        autoUpdate: (value) => Math.floor(value),
        statements: 94,
        branches: 88,
        functions: 94,
        lines: 94,
      },
    },
    // Keep server/SQLite tests in Node and browser UI tests in jsdom with their own setup.
    projects: [
      {
        extends: true,
        // Compiles server functions as the app build does, so page loaders run them on the server.
        plugins: [tanstackStart({ srcDirectory: "app" })],
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          // Start resolves server functions through a virtual module only its plugin serves.
          server: { deps: { inline: ["@tanstack/start-server-core"] } },
          // The plugin learns the server functions while it transforms their module, which a cached
          // transform skips.
          fsModuleCache: false,
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          // Vite resolves dynamic imports when transforming for jsdom, and Linux lacks `mac-ocr`.
          alias: { "mac-ocr": fileURLToPath(new URL("tests/ui/mac-ocr.stub.ts", import.meta.url)) },
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/ui/setup.ts"],
        },
      },
    ],
  },
});
