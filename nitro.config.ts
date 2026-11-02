import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  routeRules: {
    "/": { redirect: "/report" },
  },
});
