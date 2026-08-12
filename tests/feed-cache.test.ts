import assert from "node:assert/strict";
import { test } from "node:test";
import { createConsola } from "consola";
import { feedCache, parseFeedCacheArgs } from "../scripts/feed-cache.ts";
import type { Logger } from "../sdk/lib/logging-service.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";

function log(): void {}

log.raw = log;

function createMockLogger(): Logger {
  const logger = createConsola();

  logger.mockTypes(() => log);

  return Object.assign(logger, {
    progress: () => {},
  });
}

function createFixtureReport(): StoriesManifestReport {
  return {
    failures: [],
    manifest: { users: [] },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 0,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 0,
        stories: 0,
      },
      created_at: "2026-08-11T10:00:00.000Z",
      report_name: "stories-report-test.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: { users: [] },
  };
}

test("parseFeedCacheArgs reads scheduler options and forwards report args", () => {
  assert.deepEqual(
    parseFeedCacheArgs([
      "--interval-minutes",
      "15",
      "--once",
      "--max-attempts",
      "2",
      "--",
      "--report-name",
      "custom.json",
    ]),
    {
      intervalMs: 15 * 60 * 1000,
      once: true,
      reportArgs: ["--max-attempts", "2", "--report-name", "custom.json"],
    },
  );
});

test("feedCache creates a report and exits in once mode", async () => {
  const reportArgs: string[][] = [];

  await feedCache({
    args: ["--once", "--interval-ms", "10", "--report-name", "cache-feed-test.json"],
    createReport: (options) => {
      reportArgs.push(options.args ?? []);

      return Promise.resolve({
        outputFileName: "stories-report-cache-feed-test.json",
        outputPath: ".tmp/reports/stories-report-cache-feed-test.json",
        report: createFixtureReport(),
      });
    },
    logger: createMockLogger(),
    sleep: () => Promise.reject(new Error("feedCache should not sleep in once mode")),
  });

  assert.deepEqual(reportArgs, [["--report-name", "cache-feed-test.json"]]);
});
