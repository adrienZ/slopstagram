import { spawn } from "node:child_process";
import process from "node:process";
import { Queue, Worker } from "bunqueue-client";
import { definePlugin } from "nitro";
import { startWarmCacheQueue, WARM_CACHE_QUEUE_NAME } from "../../sdk/warm-cache-queue.ts";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function spawnBunqueueServer(onError: (error: Error) => void) {
  const server = spawn("bun", ["run", "bunqueue:server"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  let closing = false;

  server.on("error", onError);
  server.on("exit", (exitCode, signal) => {
    if (!closing) {
      const reason = exitCode === null ? `signal ${signal ?? "unknown"}` : `code ${exitCode}`;
      onError(new Error(`bunqueue server exited with ${reason}`));
    }
  });

  return {
    async close() {
      closing = true;
      if (server.exitCode !== null || server.signalCode !== null) return;

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.once("exit", () => {
          resolve();
        });
        server.kill("SIGTERM");
      });
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
      createQueue: (name) => new Queue(name),
      createWorker: (name, processor, options) => new Worker(name, processor, options),
    },
    onError: capturePluginError,
  });

  void runtime.ready.catch((error: unknown) => {
    capturePluginError(toError(error));
  });

  nitroApp.hooks.hook("close", () => {
    const close = async () => {
      try {
        await runtime.close();
      } catch (error) {
        capturePluginError(toError(error));
      }

      try {
        await server.close();
      } catch (error) {
        capturePluginError(toError(error));
      }
    };

    // oxlint-disable-next-line typescript/strict-void-return -- Nitro awaits close hook promises.
    return close();
  });
});
