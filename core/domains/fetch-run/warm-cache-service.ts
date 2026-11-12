import type { EventEmitter } from "node:events";
import { once } from "node:events";
import { startWarmCacheQueue } from "./warm-cache-queue.ts";

/** The part of the standalone bunqueue server process the service relies on. */
interface BunqueueServerProcess extends EventEmitter {
  exitCode: number | null;
  signalCode: string | null;
  kill: (signal: "SIGTERM") => boolean;
}

export interface WarmCacheServiceOptions {
  runtime: Parameters<typeof startWarmCacheQueue>[0];
  spawnServer: () => BunqueueServerProcess;
  onError: (error: Error) => void;
}

export interface WarmCacheService {
  close: () => Promise<void>;
}

function startBunqueueServer(
  spawnServer: () => BunqueueServerProcess,
  onError: (error: Error) => void,
) {
  const server = spawnServer();
  let closing = false;

  server.on("error", onError);
  server.on("exit", (exitCode: number | null, signal: string | null) => {
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

/** Runs the bunqueue server and schedules the hourly warm-cache job on it. */
export function startWarmCacheService({
  runtime,
  spawnServer,
  onError,
}: WarmCacheServiceOptions): WarmCacheService {
  const server = startBunqueueServer(spawnServer, onError);
  const queue = startWarmCacheQueue(runtime, { onError });

  void (async () => {
    try {
      await queue.ready;
    } catch (error) {
      onError(error instanceof Error ? error : new Error("warm-cache startup failed"));
    }
  })();

  return {
    async close() {
      try {
        await queue.close();
      } catch (error) {
        onError(error instanceof Error ? error : new Error("queue shutdown failed"));
      }

      try {
        await server.close();
      } catch (error) {
        onError(error instanceof Error ? error : new Error("server shutdown failed"));
      }
    },
  };
}
