import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  // change export condition to allow bunqueue to run inside nitro nodejs plugin runtime
  exportConditions: ["bun", "!node"],
  serverDir: "./server",
});
