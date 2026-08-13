import {
  Queue as UntypedQueue,
  shutdownManager as untypedShutdownManager,
  Worker as UntypedWorker,
} from "bunqueue/client";
import { definePlugin } from "nitro";
import { startWarmCacheQueue, WARM_CACHE_QUEUE_NAME } from "../../sdk/warm-cache-queue.ts";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export default definePlugin((nitroApp) => {
  const runtime = startWarmCacheQueue({
    dependencies: {
      // Nitro's Bun export condition currently makes these public APIs appear untyped to TS.
      // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call
      createQueue: (name, options) => new UntypedQueue(name, options),
      // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call
      createWorker: (name, processor, options) => new UntypedWorker(name, processor, options),
      shutdown() {
        // oxlint-disable-next-line typescript/no-unsafe-call
        untypedShutdownManager();
      },
    },
    onError: (error) => {
      nitroApp.captureError?.(error, { tags: ["plugin", WARM_CACHE_QUEUE_NAME] });
    },
  });

  void runtime.ready.catch((error: unknown) => {
    nitroApp.captureError?.(toError(error), { tags: ["plugin", WARM_CACHE_QUEUE_NAME] });
  });

  nitroApp.hooks.hook("close", () => {
    // oxlint-disable-next-line typescript/strict-void-return -- Nitro awaits close hook promises.
    return runtime.close();
  });
});
