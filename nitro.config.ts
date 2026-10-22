import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  serverDir: "./server",
  routeRules: {
    "/": { redirect: "/report" },
  },
});
