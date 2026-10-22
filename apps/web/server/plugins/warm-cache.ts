import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import { Queue, Worker } from "bunqueue-client";
import { definePlugin } from "nitro";
import { PROJECT_ROOT_DIR } from "@slopstagram/sdk/lib/app-data-paths.ts";
import { startWarmCacheQueue, WARM_CACHE_QUEUE_NAME } from "@slopstagram/sdk/warm-cache-queue.ts";

function spawnBunqueueServer(onError: (error: Error) => void) {
  const server = spawn("npm", ["run", "bunqueue:server"], {
    cwd: PROJECT_ROOT_DIR,
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
      if (server.exitCode !== null || server.signalCode !== null) {
        return;
      }

      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    },
  };
}

export default definePlugin((nitroApp) => {
  function capturePluginError(error: Error): void {
    nitroApp.captureError?.(error, { tags: ["plugin", WARM_CACHE_QUEUE_NAME] });
  }

  const server = spawnBunqueueServer(capturePluginError);
  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue: (name) => new Queue(name),
      createWorker: (name, processor, options) => new Worker(name, processor, options),
    },
    onError: capturePluginError,
  });

  void (async () => {
    try {
      await runtime.ready;
    } catch (error) {
      capturePluginError(error instanceof Error ? error : new Error("warm-cache startup failed"));
    }
  })();

  // oxlint-disable-next-line typescript/strict-void-return -- Nitro awaits close hook promises.
  nitroApp.hooks.hook("close", async () => {
    async function close(): Promise<void> {
      try {
        await runtime.close();
      } catch (error) {
        capturePluginError(error instanceof Error ? error : new Error("queue shutdown failed"));
      }

      try {
        await server.close();
      } catch (error) {
        capturePluginError(error instanceof Error ? error : new Error("server shutdown failed"));
      }
    }

    await close();
  });
});
