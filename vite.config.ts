import { defineConfig } from "vite";
import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    solidStart({
      appRoot: "./server",
      routeDir: "./pages",
      serverFunctions: { filter: { include: "server/**/*.{js,jsx,ts,tsx}" } },
    }),
    nitro(),
  ],
});
