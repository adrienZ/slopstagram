import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getLargestVersion,
  parseStoryManifestReport,
  parseStoryReport,
} from "../sdk/lib/parser-service.ts";
import { createCacheStorages, getMediaCacheKey } from "../sdk/lib/cache-service.ts";
import { STORY_MEDIA_TYPES } from "../sdk/lib/types.ts";
import type { StoriesManifestReport, StoriesMediaReport, StoryVersion } from "../sdk/lib/types.ts";
import storiesFixture from "./fixtures/instagram-story-data.json" with { type: "json" };
import { createMemoryStorage } from "./memory-storage.ts";

const report = storiesFixture as StoriesMediaReport;

describe("parseStoryReport", () => {
  test("returns the largest image candidate for image stories", () => {
    assert.deepEqual(parseStoryReport(report, "700000000000271"), {
      height: 2080,
      media_type: STORY_MEDIA_TYPES.IMAGE,
      pk: "700000000000271",
      story_bloks_stickers: [
        {
          bloks_sticker: {
            id: "bloks_sticker_id",
            sticker_data: {
              ig_mention: {
                full_name: "Fixture User 288",
                username: "user_045",
              },
            },
          },
          height: 0.5,
          id: "700000000000289",
          rotation: 0,
          width: 0.5,
          x: 0.5,
          y: 0.5,
        },
        {
          bloks_sticker: {
            id: "bloks_sticker_id",
            sticker_data: {
              ig_mention: {
                full_name: "Fixture User 288",
                username: "user_045",
              },
            },
          },
          height: 0.075865384615384,
          id: "700000000000290",
          rotation: 0,
          width: 0.5,
          x: 0.49980769230769,
          y: 0.24158653846154,
        },
      ],
      story_music_stickers: null,
      url: "https://example.com/anonymized/instagram-media-0273.jpg",
      width: 1170,
    });
  });

  test("returns a video source for video stories", () => {
    assert.deepEqual(parseStoryReport(report, "700000000000292"), {
      height: 1274,
      media_type: STORY_MEDIA_TYPES.VIDEO,
      pk: "700000000000292",
      story_bloks_stickers: null,
      story_music_stickers: [
        {
          id: "700000000000309",
          music_asset_info: {
            display_artist: "liminalx, exhibit",
            should_mute_audio: false,
            should_mute_audio_reason: "",
            title: "cats",
          },
        },
      ],
      url: "https://example.com/anonymized/instagram-media-0308.mp4",
      width: 716,
    });
  });

  test("resolves manifest stories from story cache", async () => {
    const { storiesStorage } = createCacheStorages(createMemoryStorage());
    const cachedItem = {
      image_versions2: {
        candidates: [
          {
            height: 120,
            url: "https://example.com/cached-story.jpg",
            width: 80,
          },
        ],
      },
      media_type: 1,
      pk: "cached-pk",
    };
    const manifestReport: StoriesManifestReport = {
      failures: [],
      manifest: {
        users: [
          {
            full_name: "Cached User",
            media_ids: ["cached-pk"],
            order: 0,
            profile_pic_url: null,
            reel_id: "reel-id",
            stories: [
              {
                ig_caption: "Cached image caption",
                locations: [],
                media_pk: "cached-pk",
                preview_image_url: null,
                stickers: [],
                status: "ok",
              },
            ],
            username: "cached_user",
          },
        ],
      },
      metadata: {
        broadcasts_count: 0,
        counts: {
          cache_hits: 1,
          cache_misses: 0,
          failed: 0,
          fetched: 0,
          reels: 1,
          stories: 1,
        },
        created_at: "2026-07-26T00:00:00.000Z",
        report_name: "stories-report.json",
        status: "ok",
        story_ranking_token: null,
      },
      output: {
        users: [
          {
            full_name: "Cached User",
            profile_pic_url: null,
            reel_ids: ["reel-id"],
            stories: [
              {
                ig_caption: "Cached image caption",
                locations: [],
                media_pk: "cached-pk",
                preview_image_url: null,
                stickers: [],
                status: "ok",
              },
            ],
            username: "cached_user",
          },
        ],
      },
    };

    await storiesStorage.setItem(getMediaCacheKey("cached-pk"), cachedItem);

    assert.deepEqual(await parseStoryManifestReport(manifestReport, "cached-pk", storiesStorage), {
      height: 120,
      media_type: STORY_MEDIA_TYPES.IMAGE,
      pk: "cached-pk",
      story_bloks_stickers: null,
      story_music_stickers: null,
      url: "https://example.com/cached-story.jpg",
      width: 80,
    });
  });
});

describe("getLargestVersion", () => {
  test("returns the candidate with the largest area", () => {
    const versions: StoryVersion[] = [
      { height: 100, url: "small", width: 50 },
      { height: 90, url: "medium", width: 100 },
      { height: 200, url: "large", width: 80 },
    ];

    assert.deepEqual(getLargestVersion(versions), {
      height: 200,
      url: "large",
      width: 80,
    });
  });

  test("returns null for empty input", () => {
    assert.equal(getLargestVersion([]), null);
    assert.equal(getLargestVersion(null), null);
  });
});
