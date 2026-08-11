import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";
import nodeAdapter from "@hono/vite-dev-server/node";

export default defineConfig({
  plugins: [
    devServer({
      adapter: nodeAdapter(),
      entry: "server/app.ts",
    }),
  ],
});
