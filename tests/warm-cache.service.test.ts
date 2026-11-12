import { EventEmitter } from "node:events";
import process from "node:process";
import { expect, test } from "vitest";
import { startWarmCacheService } from "@@/core/domains/fetch-run/warm-cache-service.ts";
import type { FetchRunQueue } from "@@/core/domains/runtime/fetch-boundaries.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

/** A bunqueue server process that exits when it is killed, like the real one. */
// oxlint-disable-next-line unicorn/prefer-event-target -- the real server process is an EventEmitter.
class FakeServer extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  signals: Array<string> = [];

  kill(signal: "SIGTERM") {
    this.signals.push(signal);
    this.signalCode = signal;
    process.nextTick(() => {
      this.emit("exit", null, signal);
    });
    return true;
  }
}

function createFakeQueue(options: { closeError?: Error; cronError?: Error } = {}) {
  const crons: Array<string> = [];
  const state = { closed: false };
  function queue(...[,]: Parameters<FetchRunQueue>): ReturnType<FetchRunQueue> {
    return {
      async close() {
        state.closed = true;
        if (options.closeError !== undefined) {
          throw options.closeError;
        }
      },
      async cron(id, pattern) {
        crons.push(`${id} ${pattern}`);
        if (options.cronError !== undefined) {
          throw options.cronError;
        }
        return null;
      },
      on() {},
    };
  }
  return { crons, state, queue };
}

async function startService(
  context: Parameters<typeof createTestRuntime>[0],
  queueOptions?: Parameters<typeof createFakeQueue>[0],
) {
  const fakeQueue = createFakeQueue(queueOptions);
  const server = new FakeServer();
  const errors: Array<string> = [];
  const service = startWarmCacheService({
    runtime: await createTestRuntime(context, { queue: fakeQueue.queue }),
    spawnServer: () => server,
    onError(error) {
      errors.push(error.message);
    },
  });
  return { ...fakeQueue, server, errors, service };
}

test("the service schedules the hourly job and stops the queue then the server on close", async (context) => {
  const { crons, state, server, errors, service } = await startService(context);

  await expect.poll(() => crons).toStrictEqual(["warm-cache 0 * * * *"]);
  await service.close();

  expect(state.closed).toBe(true);
  expect(server.signals).toStrictEqual(["SIGTERM"]);
  expect(errors).toStrictEqual([]);
});

test("closing leaves a server that already exited alone", async (context) => {
  const { server, errors, service } = await startService(context);
  server.exitCode = 0;

  await service.close();

  expect(server.signals).toStrictEqual([]);
  expect(errors).toStrictEqual([]);
});

test("the service reports a server that dies or fails to start, but not one it stopped", async (context) => {
  const { server, errors, service } = await startService(context);

  server.emit("exit", 1, null);
  server.emit("exit", null, null);
  server.emit("error", new Error("spawn npm ENOENT"));
  await service.close();

  expect(errors).toStrictEqual([
    "bunqueue server exited with code 1",
    "bunqueue server exited with signal unknown",
    "spawn npm ENOENT",
  ]);
});

test("the service reports a failure to schedule the job", async (context) => {
  const { errors } = await startService(context, { cronError: new Error("schedule failed") });

  await expect.poll(() => errors).toStrictEqual(["schedule failed"]);
});

test("a queue failing on close is reported and the server is still stopped", async (context) => {
  const { server, errors, service } = await startService(context, {
    closeError: new Error("queue is stuck"),
  });

  await service.close();

  expect(errors).toStrictEqual(["queue is stuck"]);
  expect(server.signals).toStrictEqual(["SIGTERM"]);
});
