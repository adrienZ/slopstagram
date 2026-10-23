import assert from "node:assert/strict";
import { test, type TestContext } from "vitest";
import { createConsola } from "consola";
import { createReport } from "../sdk/report.ts";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { FetchRunRepository } from "../sdk/repositories/fetch-run-repository.ts";
import { ReportRepository } from "../sdk/repositories/report-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { persistReportInstagramUsers } from "../sdk/lib/instagram-user-service.ts";
import type { Logger } from "../sdk/lib/logging-service.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";
import { createStoryFeed } from "../sdk/story-feed.ts";

function log(): void {}
log.raw = log;
function createMockLogger(): Logger {
  const logger = createConsola();
  logger.mockTypes(() => log);
  return Object.assign(logger, { progress: () => {} });
}

function createFixture(context: TestContext) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const runs = new FetchRunRepository(database);
  const reports = new ReportRepository(database);
  const stories = new StoryRepository(database);
  const users = new InstagramUserRepository(database);
  const report: StoriesManifestReport = {
    failures: [],
    manifest: { users: [] },
    output: { users: [] },
    metadata: {
      broadcasts_count: 0,
      counts: { cache_hits: 0, cache_misses: 1, failed: 0, fetched: 1, reels: 1, stories: 1 },
      created_at: "2026-10-22T10:00:00.000Z",
      report_name: "placeholder.json",
      status: "ok",
      story_ranking_token: null,
    },
  };
  const dependencies = {
    fetchRunRepository: runs,
    fetchStories: async () => report,
    saveReport: reports.save.bind(reports),
    persistReportInstagramUsers: async (value: StoriesManifestReport) => {
      await persistReportInstagramUsers(value, users);
    },
    cacheReportImages: async () => ({
      profilePicPathByUrl: new Map<string, string>(),
      storyPreviewPathByUrl: new Map<string, string>(),
    }),
    resolveAppleCaptionsForReport: async () => {},
    resolveVisionForReport: async () => new Map(),
    resolveUserSummariesForReport: async () => new Map(),
    createStoryFeed: (now: Date) =>
      createStoryFeed(now, { repository: stories, hasPreview: () => true }),
    readStoryFeedVision: () => new Map(),
  };
  const options = {
    dependencies,
    logger: createMockLogger(),
    now: () => new Date("2026-10-22T10:00:00Z"),
  };
  return { runs, reports, stories, users, report, options };
}

test("records a failed fetch attempt even when Instagram returns no tray", async (context) => {
  const { runs, options } = createFixture(context);
  let time = new Date("2026-10-22T10:00:00Z");
  await assert.rejects(
    createReport({
      ...options,
      now: () => time,
      dependencies: {
        ...options.dependencies,
        fetchStories: async () => {
          assert.equal(runs.list()[0].status, "running");
          assert.equal(runs.list()[0].startedAt, "2026-10-22T10:00:00.000Z");
          time = new Date("2026-10-22T10:00:03Z");
          throw new Error("Instagram unavailable");
        },
      },
    }),
    /Instagram unavailable/u,
  );
  const [run] = runs.list();
  assert.equal(run.status, "failed");
  assert.equal(run.finishedAt, "2026-10-22T10:00:03.000Z");
  assert.equal(run.error, "Instagram unavailable");
  assert.equal(run.storiesCount, null);
  assert.equal(run.reportKey, null);
});

test("preserves a totally failed observation and its errors before rejecting the fetch", async (context) => {
  const { runs, reports, report, options } = createFixture(context);
  Object.assign(report.metadata.counts, { fetched: 0, failed: 1 });
  report.failures.push({
    attempt_count: 3,
    http_status: 500,
    media_pk: "123",
    message: "Instagram HTTP 500",
    reason: "request_failed",
    reel_id: "456",
  });
  await assert.rejects(createReport(options), /No story media could be fetched.*HTTP 500/u);
  const [run] = runs.list();
  assert.equal(run.status, "failed");
  assert.equal(run.failedCount, 1);
  assert.equal(run.storiesCount, 1);
  assert.ok(run.reportKey !== null);
  assert.deepEqual(reports.findByKey(run.reportKey)?.failures, report.failures);
});

for (const scenario of [
  { name: "empty tray", stories: 0, fetched: 0, cacheHits: 0, failed: 0, status: "succeeded" },
  { name: "cached stories", stories: 1, fetched: 0, cacheHits: 1, failed: 0, status: "succeeded" },
  { name: "partial failure", stories: 2, fetched: 1, cacheHits: 0, failed: 1, status: "partial" },
]) {
  test(`stores the run and observation for ${scenario.name}`, async (context) => {
    const { runs, reports, report, options } = createFixture(context);
    Object.assign(report.metadata.counts, {
      stories: scenario.stories,
      fetched: scenario.fetched,
      cache_hits: scenario.cacheHits,
      failed: scenario.failed,
    });
    const result = await createReport(options);
    const [run] = runs.list();
    assert.equal(run.status, scenario.status);
    assert.equal(run.reportKey, result.reportKey);
    assert.equal(run.storiesCount, scenario.stories);
    assert.equal(run.fetchedCount, scenario.fetched);
    assert.equal(run.cacheHits, scenario.cacheHits);
    assert.equal(run.failedCount, scenario.failed);
    assert.equal(run.error, null);
    assert.ok(reports.findByKey(result.reportKey));
  });
}

test("keeps the observation and marks the run failed when enrichment fails", async (context) => {
  const { runs, reports, options } = createFixture(context);
  await assert.rejects(
    createReport({
      ...options,
      dependencies: {
        ...options.dependencies,
        cacheReportImages: async () => {
          throw new Error("Image cache unavailable");
        },
      },
    }),
    /Image cache unavailable/u,
  );
  const [run] = runs.list();
  assert.equal(run.status, "failed");
  assert.equal(run.error, "Image cache unavailable");
  assert.equal(run.fetchedCount, 1);
  assert.ok(run.reportKey !== null);
  assert.ok(reports.findByKey(run.reportKey));
});

test("separate attempts at the same instant preserve separate runs and observations", async (context) => {
  const { runs, reports, options } = createFixture(context);
  const first = await createReport(options);
  const second = await createReport(options);
  assert.notEqual(first.reportKey, second.reportKey);
  assert.equal(runs.list().length, 2);
  assert.equal(reports.listKeys().length, 2);
});
