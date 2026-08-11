import { defineNitroConfig } from "nitro/config";

const imageCacheDir = new URL("./.tmp/images", import.meta.url).pathname;
export default defineNitroConfig({
  publicAssets: [
    {
      baseURL: "images",
      dir: imageCacheDir,
    },
  ],
  srcDir: "./server",
});
