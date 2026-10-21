import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { preact } from "@preact/preset-vite";

export default defineConfig({
  plugins: [nitro(), preact()],
  environments: {
    client: {
      build: { rolldownOptions: { input: "./app/entry-client.tsx" } },
    },
  },
  // resolve: {
  //   tsconfigPaths: true,
  // },
});
