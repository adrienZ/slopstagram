import { spawn } from "node:child_process";
import process from "node:process";
import { definePlugin } from "nitro";
import { WARM_CACHE_QUEUE_NAME } from "@@/core/domains/fetch-run/warm-cache-queue.ts";
import { startWarmCacheService } from "@@/core/domains/fetch-run/warm-cache-service.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";

function spawnBunqueueServer() {
  return spawn("npm", ["run", "bunqueue:server"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
}

export default definePlugin((nitroApp) => {
  const service = startWarmCacheService({
    runtime: getProductionRuntime(),
    spawnServer: spawnBunqueueServer,
    onError(error) {
      nitroApp.captureError?.(error, { tags: ["plugin", WARM_CACHE_QUEUE_NAME] });
    },
  });

  // oxlint-disable-next-line typescript/strict-void-return -- Nitro awaits close hook promises.
  nitroApp.hooks.hook("close", async () => {
    await service.close();
  });
});
