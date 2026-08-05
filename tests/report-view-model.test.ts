import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";
import { createReportViewModel } from "../server/report-view-model.ts";

function createUncachedReport(): StoriesManifestReport {
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
      report_name: "stories-report-cache-only-regression.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: "Uncached User",
          profile_pic_url: "https://instagram.invalid/cache-only-avatar.jpg",
          reel_ids: ["cache-only-reel"],
          stories: [
            {
              apple_caption: "",
              ig_caption: "",
              locations: [],
              media_pk: "cache-only-story-that-does-not-exist",
              preview_image_url: "https://instagram.invalid/cache-only-story.jpg",
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

test(
  "createReportViewModel never fetches external resources on cache misses",
  { timeout: 2_000 },
  async () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      throw new Error("report view model must remain cache-only");
    }) as typeof fetch;

    try {
      const viewModel = await createReportViewModel(createUncachedReport());

      assert.equal(fetchCount, 0);
      assert.equal(viewModel.cachedImages.profilePicPathByUrl.size, 0);
      assert.equal(viewModel.cachedImages.storyPreviewPathByUrl.size, 0);
      assert.equal(viewModel.userSummaryByUserKey.size, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
