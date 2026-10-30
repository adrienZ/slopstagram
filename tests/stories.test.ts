import { describe, test, expect } from "vitest";
import { getMediaCacheKey } from "../sdk/lib/cache-service.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import {
  createCapturingLogger,
  createClient,
  createMemoryStoryRepository,
  fixedNow,
  noSleep,
  reel,
  storyItem,
  storyItemWithStickers,
  reelsResponse,
} from "./mock-helpers.ts";

describe("fetchStoriesManifest", () => {
  test("serves stories already stored without fetching them from Instagram", async () => {
    const storyRepository = createMemoryStoryRepository();
    await storyRepository.save(storyItem("m1", "Stored caption"));
    await storyRepository.save(storyItem("m2"));

    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [],
    );
    const logger = createCapturingLogger();

    const report = await fetchStoriesManifest(client, {
      logger,
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage: storyRepository.storyStorage,
    });

    expect(client.reelsCalls).toStrictEqual([]);
    expect(report.metadata.counts).toStrictEqual({
      cache_hits: 2,
      cache_misses: 0,
      failed: 0,
      fetched: 0,
      reels: 2,
      stories: 2,
    });
    expect(report.failures).toStrictEqual([]);
    expect(
      report.output.users.map((user) => ({
        ig_caption: user.stories[0]?.ig_caption,
        preview_image_url: user.stories[0]?.preview_image_url,
        status: user.stories[0]?.status,
        username: user.username,
      })),
    ).toStrictEqual([
      {
        ig_caption: "Stored caption",
        preview_image_url: "https://example.com/m1.jpg",
        status: "ok",
        username: "one",
      },
      {
        ig_caption: "N/A",
        preview_image_url: "https://example.com/m2.jpg",
        status: "ok",
        username: "two",
      },
    ]);
    expect(logger.messages.join("\n")).toContain("stored stories loaded: hits=2 misses=0");
    expect(logger.messages.join("\n")).toContain("all expected stories were found in cache");
  });

  test("fetches only the stories missing from storage and leaves stored ones as they are", async () => {
    const storyRepository = createMemoryStoryRepository();
    await storyRepository.save(storyItem("m1", "Stored caption"));

    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [reelsResponse({ r2: reel("r2", [storyItem("m2")]) })],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage: storyRepository.storyStorage,
    });

    expect(client.reelsCalls).toStrictEqual([["r2"]]);
    expect(report.metadata.counts).toStrictEqual({
      cache_hits: 1,
      cache_misses: 1,
      failed: 0,
      fetched: 1,
      reels: 2,
      stories: 2,
    });
    expect(storyRepository.findByMediaPk("m1")).toStrictEqual(storyItem("m1", "Stored caption"));
    expect(storyRepository.findByMediaPk("m2")).toStrictEqual(storyItem("m2"));
    expect(await storyRepository.storyStorage.getItem(getMediaCacheKey("m2"))).toStrictEqual(
      globalThis.structuredClone(storyItem("m2")),
    );
    expect(await storyRepository.storyStorage.getItem(getMediaCacheKey("m1"))).toBeNull();
    expect(report.output.users.map((user) => user.stories[0]?.ig_caption)).toStrictEqual([
      "Stored caption",
      "N/A",
    ]);
  });

  test("keeps the stored version of a story when its reel is fetched for another story", async () => {
    const storyRepository = createMemoryStoryRepository();
    await storyRepository.save(storyItem("m1", "Stored caption"));

    const client = createClient(
      [{ id: "r1", media_ids: ["m1", "m2"], user: { username: "one" } }],
      [
        reelsResponse({
          r1: reel("r1", [storyItem("m1", "Latest caption"), storyItem("m2")]),
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

    expect(client.reelsCalls).toStrictEqual([["r1"]]);
    expect(report.metadata.counts.cache_hits).toBe(1);
    expect(report.metadata.counts.fetched).toBe(1);
    expect(storyRepository.findByMediaPk("m1")?.accessibility_caption).toBe("Stored caption");
    expect(report.output.users[0]?.stories.map((story) => story.ig_caption)).toStrictEqual([
      "Stored caption",
      "N/A",
    ]);
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
        reelsResponse({
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

    expect(report.output.users).toStrictEqual([
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
            stickers: ["@same"],
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
