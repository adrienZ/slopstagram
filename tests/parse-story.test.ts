import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getLargestVersion,
  parseStoryReport,
} from "../scripts/lib/parser-service.js";
import { STORY_MEDIA_TYPES } from "../scripts/lib/types.js";
import type { StoriesMediaReport, StoryVersion } from "../scripts/lib/types.js";
import storiesFixture from "./fixtures/instagram-story-data.json" with { type: "json" };

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
    assert.equal(getLargestVersion(undefined), null);
  });
});
