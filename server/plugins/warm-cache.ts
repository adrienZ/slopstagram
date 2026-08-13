import { definePlugin } from "nitro";
import {
  attachWarmCacheQueueLogging,
  closeWarmCacheQueue,
  scheduleWarmCacheCron,
  WARM_CACHE_QUEUE_NAME,
} from "../warm-cache-queue.ts";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export default definePlugin((nitroApp) => {
  void attachWarmCacheQueueLogging((error) => {
    nitroApp.captureError?.(error, {
      tags: ["plugin", WARM_CACHE_QUEUE_NAME],
    });
  }).catch((error: unknown) => {
    nitroApp.captureError?.(toError(error), {
      tags: ["plugin", WARM_CACHE_QUEUE_NAME],
    });
  });

  void scheduleWarmCacheCron().catch((error: unknown) => {
    nitroApp.captureError?.(toError(error), {
      tags: ["plugin", WARM_CACHE_QUEUE_NAME],
    });
  });

  nitroApp.hooks.hook("close", () => {
    // oxlint-disable-next-line typescript/strict-void-return -- Nitro awaits close hook promises at runtime.
    return closeWarmCacheQueue().catch((error: unknown) => {
      nitroApp.captureError?.(toError(error), {
        tags: ["plugin", WARM_CACHE_QUEUE_NAME],
      });
    });
  });
});
