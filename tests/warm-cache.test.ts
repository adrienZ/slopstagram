import assert from "node:assert/strict";
import { test } from "bun:test";
import type { CreateReportResult } from "../sdk/report.ts";
import { runWarmCacheJob } from "../sdk/warm-cache.ts";
import { processWarmCacheJob } from "../sdk/warm-cache-worker.ts";
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

function createWarmCacheQueueJob() {
  const logs: string[] = [];
  const progress: Array<{ message?: string; value: number }> = [];

  return {
    job: {
      data: {},
      id: "job-1",
      log: (message: string) => {
        logs.push(message);
        return Promise.resolve();
      },
      updateProgress: (value: number, message?: string) => {
        progress.push({ message, value });
        return Promise.resolve();
      },
    },
    logs,
    progress,
  };
}

test("processWarmCacheJob logs success and sets progress to completed", async () => {
  const { job, logs, progress } = createWarmCacheQueueJob();
  const result = createReportResult();

  const processed = await processWarmCacheJob(job, {
    logger: createMockLogger(),
    runWarmCacheJob: () =>
      Promise.resolve({
        counts: result.report.metadata.counts,
        outputFileName: result.outputFileName,
        outputPath: result.outputPath,
      }),
  });

  assert.deepEqual(processed, {
    counts: result.report.metadata.counts,
    outputFileName: result.outputFileName,
    outputPath: result.outputPath,
  });
  assert.deepEqual(progress, [
    { message: "started", value: 0 },
    { message: "completed", value: 100 },
  ]);
  assert.deepEqual(logs, [
    "started job job-1",
    "completed job job-1",
    "output public/reports/stories-report-test.json",
    'counts {"cache_hits":1,"cache_misses":2,"failed":3,"fetched":4,"reels":5,"stories":6}',
  ]);
});

test("processWarmCacheJob logs failure and rethrows", async () => {
  const { job, logs, progress } = createWarmCacheQueueJob();
  const failure = new Error("tray fetch failed");

  await assert.rejects(
    processWarmCacheJob(job, {
      logger: createMockLogger(),
      runWarmCacheJob: () => Promise.reject(failure),
    }),
    failure,
  );

  assert.deepEqual(progress, [{ message: "started", value: 0 }]);
  assert.deepEqual(logs, ["started job job-1", "failed job job-1: tray fetch failed"]);
});
