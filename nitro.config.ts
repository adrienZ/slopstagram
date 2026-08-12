import process from "node:process";
import { URL } from "node:url";
import { defineNitroConfig } from "nitro/config";

const imageCacheDir = new URL("./.tmp/images", import.meta.url).pathname;
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

export default defineNitroConfig({
  experimental: {
    tasks: !isTest,
  },
  publicAssets: [
    {
      baseURL: "images",
      dir: imageCacheDir,
    },
  ],
  scheduledTasks: {
    // Each hour.
    "0 * * * *": "warm-cache",
  },
  srcDir: "./server",
});
