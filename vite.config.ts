import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  devtools: { apply: "serve" },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "server",
      router: { routesDirectory: "pages" },
      server: { entry: "entry-server.tsx" },
    }),
    react(),
    nitro(),
  ],
  environments: {
    ssr: { build: { rolldownOptions: { input: "./server/entry-server.tsx" } } },
  },
});
