import assert from "node:assert/strict";
import { test } from "node:test";
import type { CreateReportResult } from "../sdk/report.ts";
import {
  startWarmCacheQueue,
  WARM_CACHE_CRON_PATTERN,
  WARM_CACHE_DATA_PATH,
  WARM_CACHE_QUEUE_NAME,
  type WarmCacheQueueDependencies,
} from "../sdk/warm-cache-queue.ts";
import { runWarmCacheJob } from "../sdk/warm-cache.ts";
import { createMockLogger } from "./mock-helpers.ts";

function createReportResult(): CreateReportResult {
  return {
    outputFileName: "stories-report-test.json",
    outputPath: "public/reports/stories-report-test.json",
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
        assert.equal(typeof options.logger.progress, "function");
        return Promise.resolve(createReportResult());
      },
    },
  });

  assert.deepEqual(calls, [["--limit", "10"]]);
  assert.deepEqual(result, {
    outputFileName: "stories-report-test.json",
    outputPath: "public/reports/stories-report-test.json",
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
  let processedPayload: unknown;

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue(name, options) {
        calls.push({ arguments: [options], name: `queue:${name}` });
        return {
          close() {
            calls.push({ arguments: [], name: "queue:close" });
          },
          upsertJobScheduler(...arguments_) {
            calls.push({ arguments: arguments_, name: "queue:schedule" });
            return Promise.resolve("scheduled");
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
        };
      },
      shutdown() {
        calls.push({ arguments: [], name: "shutdown" });
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
        outputPath: result.outputPath,
      });
    },
  });

  assert.equal(await runtime.ready, "scheduled");
  assert.ok(processor);
  assert.deepEqual(await processor({ data: { reportArgs: ["--limit", "5"] } }), {
    counts: createReportResult().report.metadata.counts,
    outputFileName: "stories-report-test.json",
    outputPath: "public/reports/stories-report-test.json",
  });
  assert.deepEqual(processedPayload, { reportArgs: ["--limit", "5"] });

  workerErrorListener?.(workerError);
  assert.deepEqual(capturedErrors, [workerError]);

  await runtime.close();
  assert.deepEqual(calls, [
    {
      arguments: [
        {
          dataPath: WARM_CACHE_DATA_PATH,
          defaultJobOptions: {
            attempts: 3,
            backoff: { delay: 1_000, type: "exponential" },
          },
          embedded: true,
        },
      ],
      name: `queue:${WARM_CACHE_QUEUE_NAME}`,
    },
    {
      arguments: [
        WARM_CACHE_QUEUE_NAME,
        { pattern: WARM_CACHE_CRON_PATTERN },
        { data: {}, name: WARM_CACHE_QUEUE_NAME },
      ],
      name: "queue:schedule",
    },
    {
      arguments: [{ concurrency: 1, dataPath: WARM_CACHE_DATA_PATH, embedded: true }],
      name: `worker:${WARM_CACHE_QUEUE_NAME}`,
    },
    { arguments: [], name: "worker:close" },
    { arguments: [], name: "queue:close" },
    { arguments: [], name: "shutdown" },
  ]);
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
        };
      },
      shutdown() {
        calls.push("shutdown");
      },
    },
  });

  await assert.rejects(runtime.close(), closeFailure);
  assert.deepEqual(calls, ["worker:close", "queue:close", "shutdown"]);
});
