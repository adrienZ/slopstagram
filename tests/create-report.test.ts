import assert from "node:assert/strict";
import { test } from "node:test";
import { createReport } from "../scripts/create-report.ts";
import { noopLogger } from "../scripts/lib/logging-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

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
      fetchStories: async (_args, options) => {
        calls.push("fetch-stories");
        assert.ok(options);
        assert.match(options.reportName ?? "", /^stories-report-/);
        return report;
      },
      cacheReportImages: async (_report, options) => {
        calls.push("cache-images");
        assert.ok(options);
        return cachedImages;
      },
      resolveVisionForReport: async (_report, images, options) => {
        calls.push("cache-vision");
        assert.equal(images, cachedImages);
        return visionByPreviewUrl;
      },
      resolveOllamaUserSummariesForReport: async (_report, options) => {
        calls.push("cache-summaries");
        assert.ok(options);
        assert.equal(options.visionByPreviewUrl, visionByPreviewUrl);
        return new Map();
      },
      saveReport: async (key, savedReport) => {
        calls.push("save-report");
        assert.equal(savedReport, report);
        savedKey = key;
      },
    },
    logger: noopLogger,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
  });

  assert.deepEqual(calls, [
    "fetch-stories",
    "cache-images",
    "cache-vision",
    "cache-summaries",
    "save-report",
  ]);
  assert.equal(savedKey, result.outputFileName);
  assert.equal(result.report, report);
});
