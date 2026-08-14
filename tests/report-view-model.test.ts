import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";
import { createReportViewModel } from "../server/report-view-model.ts";

function createUncachedReport(cacheKey: string): StoriesManifestReport {
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
        reels: 1,
        stories: 1,
      },
      created_at: "2026-08-05T18:00:00.000Z",
      report_name: `stories-report-${cacheKey}.json`,
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: "Uncached User",
          profile_pic_url: `https://instagram.invalid/${cacheKey}-avatar.jpg`,
          reel_ids: [`${cacheKey}-reel`],
          stories: [
            {
              ig_caption: "",
              locations: [],
              media_pk: `${cacheKey}-story-that-does-not-exist`,
              preview_image_url: `https://instagram.invalid/${cacheKey}-story.jpg`,
              stickers: [],
              status: "ok",
            },
          ],
          username: "uncached-user",
        },
      ],
    },
  };
}

test("createReportViewModel never fetches external resources on cache misses", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = () => {
    fetchCount += 1;
    throw new Error("report view model must remain cache-only");
  };

  try {
    const viewModel = await createReportViewModel(createUncachedReport(randomUUID()));

    assert.equal(fetchCount, 0);
    assert.equal(viewModel.cachedImages.profilePicPathByUrl.size, 0);
    assert.equal(viewModel.cachedImages.storyPreviewPathByUrl.size, 0);
    assert.equal(viewModel.userSummaryByUserKey.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
