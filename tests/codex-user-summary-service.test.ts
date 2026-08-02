import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createCacheStorages } from "../scripts/lib/cache-service.ts";
import {
  CODEX_USER_SUMMARY_UNAVAILABLE,
  resolveCodexUserSummariesForReport,
} from "../scripts/lib/codex-user-summary-service.ts";
import { getReportUserKey } from "../scripts/lib/report-user-key-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

function createReport(): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [],
    },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 0,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 0,
        stories: 1,
      },
      created_at: "2026-07-26T09:48:26.773Z",
      report_name: "stories-report.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: "Summary User",
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "street food menu",
              ig_caption: "Photo by Summary User on July 26, 2026. May be food.",
              media_pk: "story-pk",
              preview_image_url: "https://example.com/story.jpg",
              stickers: ["location:Paris"],
              status: "cached",
            },
          ],
          username: "summaryuser",
        },
      ],
    },
  };
}

describe("resolveCodexUserSummariesForReport", () => {
  test("caches successful Codex summaries", async () => {
    const { codexUserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!, 0);
    const ollamaVisionByPreviewUrl = new Map([
      ["https://example.com/story.jpg", "A food stall with readable prices."],
    ]);
    let runCount = 0;

    const first = await resolveCodexUserSummariesForReport(report, {
      ollamaVisionByPreviewUrl,
      runCodexUserSummary: async (prompt, outputSchema) => {
        runCount += 1;
        assert.match(prompt, /A food stall with readable prices\./);
        assert.match(prompt, /Réponds en français\./);
        assert.deepEqual(outputSchema, {
          additionalProperties: false,
          properties: {
            summary: {
              type: "string",
            },
          },
          required: ["summary"],
          type: "object",
        });

        return JSON.stringify({
          summary:
            "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
        });
      },
      storage: codexUserSummaryStorage,
    });
    const second = await resolveCodexUserSummariesForReport(report, {
      ollamaVisionByPreviewUrl,
      runCodexUserSummary: async () => {
        runCount += 1;
        return "should not be used";
      },
      storage: codexUserSummaryStorage,
    });

    assert.equal(
      first.get(userKey),
      "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
    );
    assert.equal(
      second.get(userKey),
      "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
    );
    assert.equal(runCount, 1);
  });

  test("returns fallback text when Codex summary fails", async () => {
    const { codexUserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!, 0);

    const summaries = await resolveCodexUserSummariesForReport(report, {
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        progress: () => {},
        warn: () => {},
      },
      runCodexUserSummary: async () => {
        throw new Error("not signed in");
      },
      storage: codexUserSummaryStorage,
    });

    assert.equal(summaries.get(userKey), CODEX_USER_SUMMARY_UNAVAILABLE);
  });
});
