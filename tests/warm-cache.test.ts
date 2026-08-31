import assert from "node:assert/strict";
import { test } from "node:test";
import type { CreateReportResult } from "../sdk/report.ts";
import {
  startWarmCacheQueue,
  WARM_CACHE_CRON_PATTERN,
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
          cache_hits: 1,
          cache_misses: 2,
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
  const calls: string[][] = [];
  const result = await runWarmCacheJob({
    payload: { args: ["ignored"], reportArgs: ["--limit", "10"] },
    logger: createMockLogger(),
    dependencies: {
      createReport: (options) => {
        calls.push(options.args ?? []);
        assert.doesNotThrow(() => {
          options.logger.progress(0, 1);
        });
        return Promise.resolve(createReportResult());
      },
    },
  });

  assert.deepEqual(calls, [["--limit", "10"]]);
  assert.deepEqual(result, {
    outputFileName: "stories-report-test.json",
    reportKey: "stories-report-test.json",
    counts: {
      cache_hits: 1,
      cache_misses: 2,
      failed: 3,
      fetched: 4,
      reels: 5,
      stories: 6,
    },
  });
});

test("runWarmCacheJob accepts an empty payload", async () => {
  const calls: string[][] = [];

  await runWarmCacheJob({
    logger: createMockLogger(),
    dependencies: {
      createReport: (options) => {
        calls.push(options.args ?? []);
        return Promise.resolve(createReportResult());
      },
    },
  });

  assert.deepEqual(calls, [[]]);
});

test("startWarmCacheQueue schedules and processes warm-cache jobs", async () => {
  const calls: Array<{ arguments: unknown[]; name: string }> = [];
  let processor: Parameters<WarmCacheQueueDependencies["createWorker"]>[1] | undefined;
  let workerErrorListener: ((error: Error) => void) | undefined;
  const workerError = new Error("worker failed");
  const capturedErrors: Error[] = [];
  let processedPayload: WarmCachePayload | undefined;

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue(name) {
        calls.push({ arguments: [], name: `queue:${name}` });
        return {
          close() {
            calls.push({ arguments: [], name: "queue:close" });
          },
          waitUntilReady() {
            calls.push({ arguments: [], name: "queue:ready" });
            return Promise.resolve();
          },
          upsertJobScheduler(...arguments_) {
            calls.push({ arguments: arguments_, name: "queue:schedule" });
            return Promise.resolve();
          },
        };
      },
      createWorker(name, nextProcessor, options) {
        calls.push({ arguments: [options], name: `worker:${name}` });
        processor = nextProcessor;
        return {
          close() {
            calls.push({ arguments: [], name: "worker:close" });
            return Promise.resolve();
          },
          on(_event, listener) {
            workerErrorListener = listener;
            return this;
          },
          run() {
            calls.push({ arguments: [], name: "worker:run" });
          },
          waitUntilReady() {
            calls.push({ arguments: [], name: "worker:ready" });
            return Promise.resolve();
          },
        };
      },
    },
    logger: createMockLogger(),
    onError(error) {
      capturedErrors.push(error);
    },
    runJob: (options = {}) => {
      processedPayload = options.payload;
      const result = createReportResult();
      return Promise.resolve({
        counts: result.report.metadata.counts,
        outputFileName: result.outputFileName,
        reportKey: result.reportKey,
      });
    },
  });

  await runtime.ready;
  assert.ok(processor);
  assert.deepEqual(await processor({ data: { reportArgs: ["--limit", "5"] } }), {
    counts: createReportResult().report.metadata.counts,
    outputFileName: "stories-report-test.json",
    reportKey: "stories-report-test.json",
  });
  assert.deepEqual(processedPayload, { reportArgs: ["--limit", "5"] });

  workerErrorListener?.(workerError);
  assert.deepEqual(capturedErrors, [workerError]);

  await runtime.close();
  assert.deepEqual(calls, [
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
        { pattern: WARM_CACHE_CRON_PATTERN },
        {
          data: {},
          name: WARM_CACHE_QUEUE_NAME,
          opts: {
            attempts: 3,
            backoff: { delay: 1_000, type: "exponential" },
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
  const calls: string[] = [];

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue() {
        return {
          close() {},
          waitUntilReady() {
            readyAttempts += 1;
            return readyAttempts === 1
              ? Promise.reject(new Error("server is starting"))
              : Promise.resolve();
          },
          upsertJobScheduler() {
            calls.push("schedule");
            return Promise.resolve();
          },
        };
      },
      createWorker() {
        return {
          close: () => Promise.resolve(),
          on() {
            return this;
          },
          run() {
            calls.push("worker:run");
          },
          waitUntilReady() {
            calls.push("worker:ready");
            return Promise.resolve();
          },
        };
      },
    },
  });

  await runtime.ready;
  assert.equal(readyAttempts, 2);
  assert.deepEqual(calls, ["schedule", "worker:run", "worker:ready"]);
  await runtime.close();
});

test("startWarmCacheQueue cleans up when its worker fails to close", async () => {
  const calls: string[] = [];
  const closeFailure = new Error("close failed");

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue() {
        return {
          close() {
            calls.push("queue:close");
          },
          waitUntilReady: () => Promise.resolve(),
          upsertJobScheduler: () => Promise.resolve(),
        };
      },
      createWorker() {
        return {
          close() {
            calls.push("worker:close");
            return Promise.reject(closeFailure);
          },
          on() {
            return this;
          },
          run() {},
          waitUntilReady: () => Promise.resolve(),
        };
      },
    },
  });

  await runtime.ready;
  await assert.rejects(runtime.close(), closeFailure);
  assert.deepEqual(calls, ["worker:close", "queue:close"]);
});
