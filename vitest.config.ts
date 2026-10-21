import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["sdk/**/*.ts", "scripts/**/*.ts", "server/**/*.{ts,tsx}"],
      reporter: ["text", "lcov"],
    },
    projects: [
      {
        plugins: [solid({ ssr: true, hot: false })],
        resolve: {
          conditions: ["node"],
          alias: {
            "server-only": fileURLToPath(
              new globalThis.URL("./tests/fixtures/server-only.ts", import.meta.url),
            ),
          },
        },
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.browser.test.ts"],
          environment: "node",
          server: {
            deps: { inline: ["solid-js", "@solidjs/meta", "@solidjs/router"] },
          },
        },
      },
      {
        plugins: [solid({ hot: false })],
        // Browser fixtures replace server queries, so avoid crawling their server-only imports.
        optimizeDeps: {
          noDiscovery: true,
          include: ["solid-js", "solid-js/web", "zod", "clsx"],
        },
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: false,
            provider: playwright({ actionTimeout: 5000 }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
