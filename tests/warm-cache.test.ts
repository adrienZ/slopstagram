import { assert, test, expect } from "vitest";
import type { CreateReportResult } from "../sdk/report.ts";
import {
  startWarmCacheQueue,
  WARM_CACHE_QUEUE_NAME,
  type WarmCacheQueueDependencies,
} from "../sdk/warm-cache-queue.ts";
import { runWarmCacheJob, type WarmCachePayload } from "../sdk/warm-cache.ts";
import { createMockLogger } from "./mock-helpers.ts";

function createReportResult(): CreateReportResult {
  return {
    outputFileName: "stories-report-test.json",
    reportKey: "stories-report-test.json",
    report: {
      failures: [],
      manifest: { users: [] },
      metadata: {
        broadcasts_count: 0,
        counts: {
          failed: 3,
          fetched: 4,
          reels: 5,
          stories: 6,
        },
        created_at: "2026-08-12T10:00:00.000Z",
        report_name: "stories-report-test.json",
        status: "ok",
        story_ranking_token: null,
      },
      output: { users: [] },
    },
  };
}

test("runWarmCacheJob creates a report using reportArgs from the payload", async () => {
  const calls: Array<Array<string>> = [];
  const result = await runWarmCacheJob({
    payload: { args: ["ignored"], reportArgs: ["--limit", "10"] },
    logger: createMockLogger(),
    dependencies: {
      createReport: async (options) => {
        calls.push(options.args ?? []);
        expect(() => {
          options.logger.progress(0, 1);
        }).not.toThrow();
        return createReportResult();
      },
    },
  });

  expect(calls).toStrictEqual([["--limit", "10"]]);
  expect(result).toStrictEqual({
    outputFileName: "stories-report-test.json",
    reportKey: "stories-report-test.json",
    counts: {
      failed: 3,
      fetched: 4,
      reels: 5,
      stories: 6,
    },
  });
});

test("runWarmCacheJob accepts an empty payload", async () => {
  const calls: Array<Array<string>> = [];

  await runWarmCacheJob({
    logger: createMockLogger(),
    dependencies: {
      createReport: async (options) => {
        calls.push(options.args ?? []);
        return createReportResult();
      },
    },
  });

  expect(calls).toStrictEqual([[]]);
});

test("startWarmCacheQueue schedules and processes warm-cache jobs", async () => {
  const calls: Array<{ arguments: Array<unknown>; name: string }> = [];
  let processor: Parameters<WarmCacheQueueDependencies["createWorker"]>[1] | undefined;
  let workerErrorListener: ((error: Error) => void) | undefined;
  const workerError = new Error("worker failed");
  const capturedErrors: Array<Error> = [];
  let processedPayload: WarmCachePayload | undefined;

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue(name) {
        calls.push({ arguments: [], name: `queue:${name}` });
        return {
          close() {
            calls.push({ arguments: [], name: "queue:close" });
          },
          async waitUntilReady() {
            calls.push({ arguments: [], name: "queue:ready" });
          },
          async upsertJobScheduler(...arguments_) {
            calls.push({ arguments: arguments_, name: "queue:schedule" });
          },
        };
      },
      createWorker(name, nextProcessor, options) {
        calls.push({ arguments: [options], name: `worker:${name}` });
        processor = nextProcessor;
        return {
          async close() {
            calls.push({ arguments: [], name: "worker:close" });
          },
          on(_event, listener) {
            workerErrorListener = listener;
            return this;
          },
          run() {
            calls.push({ arguments: [], name: "worker:run" });
          },
          async waitUntilReady() {
            calls.push({ arguments: [], name: "worker:ready" });
          },
        };
      },
    },
    logger: createMockLogger(),
    onError(error) {
      capturedErrors.push(error);
    },
    runJob: async (options = {}) => {
      processedPayload = options.payload;
      const result = createReportResult();
      return {
        counts: result.report.metadata.counts,
        outputFileName: result.outputFileName,
        reportKey: result.reportKey,
      };
    },
  });

  await runtime.ready;
  assert.ok(processor);
  expect(await processor({ data: { reportArgs: ["--limit", "5"] } })).toStrictEqual({
    counts: createReportResult().report.metadata.counts,
    outputFileName: "stories-report-test.json",
    reportKey: "stories-report-test.json",
  });
  expect(processedPayload).toStrictEqual({ reportArgs: ["--limit", "5"] });

  workerErrorListener?.(workerError);
  expect(capturedErrors).toStrictEqual([workerError]);

  await runtime.close();
  expect(calls).toStrictEqual([
    {
      arguments: [],
      name: `queue:${WARM_CACHE_QUEUE_NAME}`,
    },
    {
      arguments: [{ autorun: false, concurrency: 1 }],
      name: `worker:${WARM_CACHE_QUEUE_NAME}`,
    },
    { arguments: [], name: "queue:ready" },
    {
      arguments: [
        WARM_CACHE_QUEUE_NAME,
        { pattern: "0 * * * *" },
        {
          data: {},
          name: WARM_CACHE_QUEUE_NAME,
          opts: {
            attempts: 3,
            backoff: { delay: 1000, type: "exponential" },
          },
        },
      ],
      name: "queue:schedule",
    },
    { arguments: [], name: "worker:run" },
    { arguments: [], name: "worker:ready" },
    { arguments: [], name: "worker:close" },
    { arguments: [], name: "queue:close" },
  ]);
});

test("startWarmCacheQueue retries while the standalone server starts", async () => {
  let readyAttempts = 0;
  const calls: Array<string> = [];

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue() {
        return {
          close() {},
          async waitUntilReady() {
            readyAttempts += 1;
            if (readyAttempts === 1) {
              throw new Error("server is starting");
            }
          },
          async upsertJobScheduler() {
            calls.push("schedule");
          },
        };
      },
      createWorker() {
        return {
          close: async () => {},
          on() {
            return this;
          },
          run() {
            calls.push("worker:run");
          },
          async waitUntilReady() {
            calls.push("worker:ready");
          },
        };
      },
    },
  });

  await runtime.ready;
  expect(readyAttempts).toBe(2);
  expect(calls).toStrictEqual(["schedule", "worker:run", "worker:ready"]);
  await runtime.close();
});

test("startWarmCacheQueue cleans up when its worker fails to close", async () => {
  const calls: Array<string> = [];
  const closeFailure = new Error("close failed");

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue() {
        return {
          close() {
            calls.push("queue:close");
          },
          waitUntilReady: async () => {},
          upsertJobScheduler: async () => {},
        };
      },
      createWorker() {
        return {
          async close() {
            calls.push("worker:close");
            throw closeFailure;
          },
          on() {
            return this;
          },
          run() {},
          waitUntilReady: async () => {},
        };
      },
    },
  });

  await runtime.ready;
  await expect(runtime.close()).rejects.toThrow(closeFailure);
  expect(calls).toStrictEqual(["worker:close", "queue:close"]);
});
