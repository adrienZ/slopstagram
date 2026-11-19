import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./nitro",
  routeRules: {
    "/": { redirect: "/report" },
  },
});
