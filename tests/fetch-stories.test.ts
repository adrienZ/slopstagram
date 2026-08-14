import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import { getMediaCacheKey } from "../sdk/lib/cache-service.ts";
import {
  createCapturingLogger,
  createClient,
  createMemoryCacheStorages,
  fixedNow,
  noSleep,
  reel,
  response,
  storyItem,
  storyItemWithStickers,
} from "./mock-helpers.ts";

describe("fetchStoriesManifest", () => {
  test("uses cached media items without calling reels media", async () => {
    const { storiesStorage } = createMemoryCacheStorages();
    await storiesStorage.setItem(getMediaCacheKey("m1"), storyItem("m1"));
    await storiesStorage.setItem(getMediaCacheKey("m2"), storyItem("m2"));

    const client = createClient(
      [
        {
          id: "r1",
          media_ids: ["m1"],
          user: {
            id: "instagram-id-1",
            pk: "instagram-pk-1",
            profile_pic_url: "https://example.com/one.jpg",
            username: "one",
          },
        },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(client.reelsCalls, []);
    assert.deepEqual(report.metadata.counts, {
      cache_hits: 2,
      cache_misses: 0,
      failed: 0,
      fetched: 0,
      reels: 2,
      stories: 2,
    });
    assert.deepEqual(
      report.manifest.users.map((user) => ({
        id: user.id,
        ig_caption: user.stories[0]?.ig_caption,
        locations: user.stories[0]?.locations,
        media_type: user.stories[0]?.media_type,
        pk: user.pk,
        profile_pic_url: user.profile_pic_url,
        reel_id: user.reel_id,
        status: user.stories[0]?.status,
        stickers: user.stories[0]?.stickers,
        username: user.username,
      })),
      [
        {
          id: "instagram-id-1",
          ig_caption: "N/A",
          locations: [],
          media_type: "image",
          pk: "instagram-pk-1",
          profile_pic_url: "https://example.com/one.jpg",
          reel_id: "r1",
          status: "ok",
          stickers: [],
          username: "one",
        },
        {
          id: "r2",
          ig_caption: "N/A",
          locations: [],
          media_type: "image",
          pk: "r2",
          profile_pic_url: null,
          reel_id: "r2",
          status: "ok",
          stickers: [],
          username: "two",
        },
      ],
    );
    assert.deepEqual(report.output.users, [
      {
        full_name: null,
        profile_pic_url: "https://example.com/one.jpg",
        reel_ids: ["r1"],
        stories: [
          {
            ig_caption: "N/A",
            locations: [],
            media_type: "image",
            media_pk: "m1",
            preview_image_url: "https://example.com/m1.jpg",
            stickers: [],
            status: "ok",
          },
        ],
        username: "one",
      },
      {
        full_name: null,
        profile_pic_url: null,
        reel_ids: ["r2"],
        stories: [
          {
            ig_caption: "N/A",
            locations: [],
            media_type: "image",
            media_pk: "m2",
            preview_image_url: "https://example.com/m2.jpg",
            stickers: [],
            status: "ok",
          },
        ],
        username: "two",
      },
    ]);
  });

  test("fetches only reels with missing media and caches returned items", async () => {
    const { storiesStorage } = createMemoryCacheStorages();
    await storiesStorage.setItem(getMediaCacheKey("m1"), storyItem("m1", "Cached image caption"));

    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [
        response({
          reels: {
            r2: reel("r2", [storyItem("m2")]),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(client.reelsCalls, [["r2"]]);
    assert.equal(await storiesStorage.hasItem(getMediaCacheKey("m2")), true);
    assert.deepEqual(
      report.manifest.users.map((user) => ({
        ig_caption: user.stories[0]?.ig_caption,
        locations: user.stories[0]?.locations,
        status: user.stories[0]?.status,
        stickers: user.stories[0]?.stickers,
      })),
      [
        {
          ig_caption: "Cached image caption",
          locations: [],
          status: "ok",
          stickers: [],
        },
        {
          ig_caption: "N/A",
          locations: [],
          status: "ok",
          stickers: [],
        },
      ],
    );
    assert.equal(report.metadata.counts.cache_hits, 1);
    assert.equal(report.metadata.counts.fetched, 1);
  });

  test("groups final output by user with story accessibility captions", async () => {
    const { storiesStorage } = createMemoryCacheStorages();
    const client = createClient(
      [
        {
          id: "r1",
          media_ids: ["m1"],
          user: {
            full_name: "Same User",
            profile_pic_url: "https://example.com/same.jpg",
            username: "same",
          },
        },
        {
          id: "r2",
          media_ids: ["m2"],
          user: { full_name: "Same User", username: "same" },
        },
      ],
      [
        response({
          reels: {
            r1: reel("r1", [
              storyItemWithStickers(
                "m1",
                {
                  story_bloks_stickers: [
                    {
                      bloks_sticker: {
                        sticker_data: {
                          ig_mention: {
                            username: "same",
                          },
                        },
                      },
                    },
                  ],
                },
                "First story caption",
              ),
            ]),
            r2: reel("r2", [storyItem("m2", "Second story caption")]),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(report.output.users, [
      {
        full_name: "Same User",
        profile_pic_url: "https://example.com/same.jpg",
        reel_ids: ["r1", "r2"],
        stories: [
          {
            ig_caption: "First story caption",
            locations: [],
            media_type: "image",
            media_pk: "m1",
            preview_image_url: "https://example.com/m1.jpg",
            stickers: ["mention:@same"],
            status: "ok",
          },
          {
            ig_caption: "Second story caption",
            locations: [],
            media_type: "image",
            media_pk: "m2",
            preview_image_url: "https://example.com/m2.jpg",
            stickers: [],
            status: "ok",
          },
        ],
        username: "same",
      },
    ]);
  });
});
