import assert from "node:assert/strict";
import { test } from "node:test";
import { createConsola } from "consola";
import { createReport } from "../sdk/index.ts";
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
        fetched: 1,
        reels: 1,
        stories: 1,
      },
      created_at: "2026-08-05T18:00:00.000Z",
      report_name: "placeholder.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: { users: [] },
  };
}

test("createReport resolves entities before persisting the report", async () => {
  const report = createFixtureReport();
  const calls: Array<string> = [];
  const cachedImages = {
    profilePicPathByUrl: new Map([["avatar-source", "images/avatar.jpg"]]),
    storyPreviewPathByUrl: new Map([["story-source", "images/story.jpg"]]),
  };
  const visionByPreviewUrl = new Map([
    ["story-source", { text: "cached text", visual: "cached visual" }],
  ]);
  let savedKey: string | undefined;

  const result = await createReport({
    dependencies: {
      migrateDatabase: () => {
        calls.push("migrate-database");
      },
      persistReportInstagramUsers: async () => {
        calls.push("persist-instagram-users");
      },
      fetchStories: async (_args, options) => {
        calls.push("fetch-stories");
        if (options === undefined) {
          assert.fail("expected fetch stories options");
        }
        assert.match(options.reportName ?? "", /^stories-report-/u);
        return report;
      },
      cacheReportImages: async (_report, options) => {
        calls.push("cache-images");
        assert.doesNotThrow(() => {
          options.logger.progress(0, 1);
        });
        return cachedImages;
      },
      resolveAppleCaptionsForReport: async (_report, images, options) => {
        calls.push("resolve-apple-captions");
        assert.equal(images, cachedImages);
        assert.doesNotThrow(() => {
          options.logger.progress(0, 1);
        });
      },
      resolveVisionForReport: async (_report, images) => {
        calls.push("resolve-vision");
        assert.equal(images, cachedImages);
        return visionByPreviewUrl;
      },
      resolveUserSummariesForReport: async (_report, options) => {
        calls.push("resolve-summaries");
        assert.doesNotThrow(() => {
          options.logger.progress(0, 1);
        });
        assert.equal(options.visionByPreviewUrl, visionByPreviewUrl);
        return new Map();
      },
      saveReport: async (key, savedReport) => {
        calls.push("save-report");
        assert.equal(savedReport, report);
        savedKey = key;
      },
    },
    logger: createMockLogger(),
    now: () => new Date("2026-08-05T18:00:00.000Z"),
  });

  assert.deepEqual(calls, [
    "migrate-database",
    "fetch-stories",
    "cache-images",
    "resolve-apple-captions",
    "resolve-vision",
    "persist-instagram-users",
    "resolve-summaries",
    "save-report",
  ]);
  assert.equal(savedKey, result.outputFileName);
  assert.equal(result.report, report);
});

test("createReport rejects total media failure before caching or saving a report", async () => {
  const report = createFixtureReport();
  report.metadata.counts.fetched = 0;
  report.metadata.counts.failed = 1;
  report.failures.push({
    attempt_count: 3,
    http_status: 500,
    media_pk: "123",
    message: "Instagram request failed with HTTP 500",
    reason: "request_failed",
    reel_id: "456",
  });
  const calls: Array<string> = [];

  await assert.rejects(
    createReport({
      dependencies: {
        migrateDatabase: () => {},
        fetchStories: async () => report,
        cacheReportImages: async () => {
          calls.push("cache-images");
          return { profilePicPathByUrl: new Map(), storyPreviewPathByUrl: new Map() };
        },
        resolveAppleCaptionsForReport: async () => {},
        resolveVisionForReport: async () => new Map(),
        resolveUserSummariesForReport: async () => new Map(),
        persistReportInstagramUsers: async () => {},
        saveReport: async () => {
          calls.push("save-report");
        },
      },
      logger: createMockLogger(),
    }),
    /No story media could be fetched.*Report was not saved.*HTTP 500/u,
  );
  assert.deepEqual(calls, []);
});

for (const scenario of [
  { name: "empty tray", stories: 0, fetched: 0, cacheHits: 0, failed: 0 },
  { name: "cached stories", stories: 1, fetched: 0, cacheHits: 1, failed: 0 },
  { name: "partial failure", stories: 2, fetched: 1, cacheHits: 0, failed: 1 },
]) {
  test(`createReport still saves a report with ${scenario.name}`, async () => {
    const report = createFixtureReport();
    Object.assign(report.metadata.counts, {
      stories: scenario.stories,
      fetched: scenario.fetched,
      cache_hits: scenario.cacheHits,
      failed: scenario.failed,
    });
    let saved = false;
    await createReport({
      dependencies: {
        migrateDatabase: () => {},
        fetchStories: async () => report,
        cacheReportImages: async () => ({
          profilePicPathByUrl: new Map(),
          storyPreviewPathByUrl: new Map(),
        }),
        resolveAppleCaptionsForReport: async () => {},
        resolveVisionForReport: async () => new Map(),
        resolveUserSummariesForReport: async () => new Map(),
        persistReportInstagramUsers: async () => {},
        saveReport: async () => {
          saved = true;
        },
      },
      logger: createMockLogger(),
    });
    assert.equal(saved, true);
  });
}
