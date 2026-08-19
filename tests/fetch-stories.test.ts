import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getMediaCacheKey } from "../sdk/lib/cache-service.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import {
  createCapturingLogger,
  createClient,
  createMemoryStoryRepository,
  fixedNow,
  noSleep,
  reel,
  response,
  storyItem,
  storyItemWithStickers,
} from "./mock-helpers.ts";

describe("fetchStoriesManifest", () => {
  test("fetches API media even when story storage has existing entries", async () => {
    const storyRepository = createMemoryStoryRepository();
    await storyRepository.save(storyItem("m1"));
    await storyRepository.save(storyItem("m2"));

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
      [
        response({
          reels: {
            r1: reel("r1", [storyItem("m1")]),
            r2: reel("r2", [storyItem("m2")]),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage: storyRepository.storyStorage,
    });

    assert.deepEqual(client.reelsCalls, [["r1", "r2"]]);
    assert.deepEqual(report.metadata.counts, {
      cache_hits: 0,
      cache_misses: 2,
      failed: 0,
      fetched: 2,
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
    assert.deepEqual(
      await storyRepository.storyStorage.getItem(getMediaCacheKey("m1")),
      JSON.parse(JSON.stringify(storyItem("m1"))),
    );
  });

  test("stores every returned media item as a side effect", async () => {
    const storyRepository = createMemoryStoryRepository();
    await storyRepository.save(storyItem("m1", "Cached image caption"));

    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [
        response({
          reels: {
            r1: reel("r1", [storyItem("m1", "Latest image caption")]),
            r2: reel("r2", [storyItem("m2")]),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage: storyRepository.storyStorage,
    });

    assert.deepEqual(client.reelsCalls, [["r1", "r2"]]);
    assert.deepEqual(await storyRepository.findByMediaPk("m2"), storyItem("m2"));
    assert.deepEqual(
      await storyRepository.storyStorage.getItem(getMediaCacheKey("m2")),
      JSON.parse(JSON.stringify(storyItem("m2"))),
    );
    assert.deepEqual(
      report.manifest.users.map((user) => ({
        ig_caption: user.stories[0]?.ig_caption,
        locations: user.stories[0]?.locations,
        status: user.stories[0]?.status,
        stickers: user.stories[0]?.stickers,
      })),
      [
        {
          ig_caption: "Latest image caption",
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
    assert.equal(report.metadata.counts.cache_hits, 0);
    assert.equal(report.metadata.counts.fetched, 2);
  });

  test("groups final output by user with story accessibility captions", async () => {
    const storyRepository = createMemoryStoryRepository();
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
      storyRepository,
      storyStorage: storyRepository.storyStorage,
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
