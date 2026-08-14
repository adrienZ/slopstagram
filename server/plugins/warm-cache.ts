import process from "node:process";
import Bun from "bun";
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

function spawnBunqueueServer(onError: (error: Error) => void) {
  const server = Bun.spawn([process.execPath, "run", "bunqueue:server"], {
    cwd: process.cwd(),
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  });
  let closing = false;

  void server.exited.then((exitCode) => {
    if (!closing && exitCode !== 0) {
      onError(new Error(`bunqueue server exited with code ${exitCode}`));
    }
  });

  return {
    async close() {
      closing = true;
      server.kill("SIGTERM");
      await server.exited;
    },
  };
}

export default definePlugin((nitroApp) => {
  const capturePluginError = (error: Error) => {
    nitroApp.captureError?.(error, { tags: ["plugin", WARM_CACHE_QUEUE_NAME] });
  };

  const server = spawnBunqueueServer(capturePluginError);
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
    onError: capturePluginError,
  });

  void runtime.ready.catch((error: unknown) => {
    capturePluginError(toError(error));
  });

  nitroApp.hooks.hook("close", () => {
    const close = async () => {
      const results = await Promise.allSettled([runtime.close(), server.close()]);
      for (const result of results) {
        if (result.status === "rejected") capturePluginError(toError(result.reason));
      }
    };

    // oxlint-disable-next-line typescript/strict-void-return -- Nitro awaits close hook promises.
    return close();
  });
});
