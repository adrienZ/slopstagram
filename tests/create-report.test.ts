import assert from "node:assert/strict";
import { test } from "bun:test";
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

test("createReport prepares every cache before persisting the report", async () => {
  const report = createFixtureReport();
  const calls: string[] = [];
  const cachedImages = {
    profilePicPathByUrl: new Map([["avatar-source", "../images/avatar.jpg"]]),
    storyPreviewPathByUrl: new Map([["story-source", "../images/story.jpg"]]),
  };
  const visionByPreviewUrl = new Map([
    ["story-source", { text: "cached text", visual: "cached visual" }],
  ]);
  let savedKey: string | undefined;

  const result = await createReport({
    dependencies: {
      fetchStories: (_args, options) => {
        calls.push("fetch-stories");
        if (options === undefined) {
          assert.fail("expected fetch stories options");
        }
        assert.match(options.reportName ?? "", /^stories-report-/u);
        return Promise.resolve(report);
      },
      cacheReportImages: (_report, options) => {
        calls.push("cache-images");
        assert.equal(typeof options.logger.progress, "function");
        return Promise.resolve(cachedImages);
      },
      resolveAppleCaptionsForReport: (_report, images, options) => {
        calls.push("cache-apple-captions");
        assert.equal(images, cachedImages);
        assert.equal(typeof options.logger.progress, "function");
        return Promise.resolve();
      },
      resolveVisionForReport: (_report, images) => {
        calls.push("cache-vision");
        assert.equal(images, cachedImages);
        return Promise.resolve(visionByPreviewUrl);
      },
      resolveUserSummariesForReport: (_report, options) => {
        calls.push("cache-summaries");
        assert.equal(typeof options.logger.progress, "function");
        assert.equal(options.visionByPreviewUrl, visionByPreviewUrl);
        return Promise.resolve(new Map());
      },
      saveReport: (key, savedReport) => {
        calls.push("save-report");
        assert.equal(savedReport, report);
        savedKey = key;
        return Promise.resolve();
      },
    },
    logger: createMockLogger(),
    now: () => new Date("2026-08-05T18:00:00.000Z"),
  });

  assert.deepEqual(calls, [
    "fetch-stories",
    "cache-images",
    "cache-apple-captions",
    "cache-vision",
    "cache-summaries",
    "save-report",
  ]);
  assert.equal(savedKey, result.outputFileName);
  assert.equal(result.report, report);
});
