import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtoolsLaunchers } from "./devtools/launchers.ts";

export default defineConfig({
  devtools: { apply: "serve" },
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    noExternal: ["react-use"],
  },
  optimizeDeps: {
    // The map is behind a lazy import, so Vite would only find it after startup
    // and re-optimize, leaving a second copy of React inside the map bundle.
    include: ["react-map-gl/maplibre", "maplibre-gl"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "app",
    }),
    react(),
    nitro(),
    devtoolsLaunchers(),
  ],
});
