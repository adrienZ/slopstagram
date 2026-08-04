import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { backfillReportStoryMediaTypes } from "../scripts/create-html-report.ts";
import { getMediaCacheKey } from "../scripts/lib/cache-service.ts";
import type { StoriesManifestReport, StoryItem } from "../scripts/lib/types.ts";

function createLegacyReport(): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [
        {
          full_name: null,
          media_ids: ["story-pk-1", "story-pk-2"],
          order: 0,
          profile_pic_url: null,
          reel_id: "r1",
          stories: [
            {
              apple_caption: "apple image",
              cache_key: getMediaCacheKey("story-pk-1"),
              ig_caption: "ig image",
              locations: [],
              media_pk: "story-pk-1",
              preview_image_url: "https://example.com/story-1.jpg",
              stickers: [],
              status: "ok",
            },
            {
              apple_caption: "apple video",
              cache_key: getMediaCacheKey("story-pk-2"),
              ig_caption: "ig video",
              locations: [],
              media_pk: "story-pk-2",
              preview_image_url: "https://example.com/story-2.jpg",
              stickers: [],
              status: "ok",
            },
          ],
          username: "legacy",
        },
      ],
    },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 2,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 1,
        stories: 2,
      },
      created_at: "2026-07-26T09:48:26.773Z",
      report_name: "stories-report.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: null,
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple image",
              ig_caption: "ig image",
              locations: [],
              media_pk: "story-pk-1",
              preview_image_url: "https://example.com/story-1.jpg",
              stickers: [],
              status: "ok",
            },
            {
              apple_caption: "apple video",
              ig_caption: "ig video",
              locations: [],
              media_pk: "story-pk-2",
              preview_image_url: "https://example.com/story-2.jpg",
              stickers: [],
              status: "ok",
            },
          ],
          username: "legacy",
        },
      ],
    },
  };
}

describe("backfillReportStoryMediaTypes", () => {
  test("fills missing media types from cached story payloads", async () => {
    const storage = createStorage<StoryItem>({
      driver: memoryDriver(),
    });
    const report = createLegacyReport();

    await storage.setItem(getMediaCacheKey("story-pk-1"), {
      media_type: 1,
      pk: "story-pk-1",
    });
    await storage.setItem(getMediaCacheKey("story-pk-2"), {
      media_type: 2,
      pk: "story-pk-2",
    });

    await backfillReportStoryMediaTypes(report, storage);

    assert.deepEqual(
      report.output.users[0]?.stories.map((story) => story.media_type),
      ["image", "video"],
    );
    assert.deepEqual(
      report.manifest.users[0]?.stories.map((story) => story.media_type),
      ["image", "video"],
    );
  });
});
