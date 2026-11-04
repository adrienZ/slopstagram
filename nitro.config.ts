import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  serverDir: "./nitro",
  routeRules: {
    "/": { redirect: "/report" },
  },
});
