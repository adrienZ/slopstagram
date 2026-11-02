import { definePlugin } from "nitro";
import { mountFileCache } from "@@/core/lib/cache-service.ts";

export default definePlugin(() => {
  mountFileCache();
});
