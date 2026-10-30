import { assert, describe, test, expect } from "vitest";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  noSleep,
  reel,
  storyItem,
  storyItemWithStickers,
  reelsResponse,
  response,
} from "./mock-helpers.ts";
import { createStoryFixtures } from "./test-database.ts";

describe("fetchStoriesManifest edge cases", () => {
  test("preserves tray and media order in the manifest", async (context) => {
    const { storyRepository, storyStorage } = createStoryFixtures(context);
    const client = createClient(
      [
        { id: "r2", media_ids: ["m2", "m3"], user: { username: "two" } },
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
      ],
      [
        reelsResponse({
          r1: reel("r1", [storyItem("m1")]),
          r2: reel("r2", [storyItem("m3"), storyItem("m2")]),
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage,
    });

    expect(
      report.manifest.users.map((user) => ({
        media_ids: user.media_ids,
        reel_id: user.reel_id,
      })),
    ).toStrictEqual([
      { media_ids: ["m2", "m3"], reel_id: "r2" },
      { media_ids: ["m1"], reel_id: "r1" },
    ]);
  });

  test("extracts sticker summaries from story payload", async (context) => {
    const { storyRepository, storyStorage } = createStoryFixtures(context);
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [
        reelsResponse({
          r1: reel("r1", [
            storyItemWithStickers(
              "m1",
              {
                link: {
                  url: "https://example.com/a",
                },
                story_bloks_stickers: [
                  {
                    bloks_sticker: {
                      sticker_data: {
                        ig_mention: {
                          username: "friend",
                        },
                      },
                    },
                  },
                  {
                    bloks_sticker: {
                      sticker_data: {
                        location: {
                          address: "1 Rue Example, Paris",
                          name: "Cafe Example",
                        },
                      },
                    },
                  },
                ],
                story_hashtags: [{ hashtag: "summer" }],
                story_locations: [
                  {
                    location: {
                      address: "1 Rue Example, Paris",
                      name: "Cafe Example",
                    },
                  },
                ],
                story_music_stickers: [
                  {
                    music_asset_info: {
                      display_artist: "Artist",
                      title: "Track",
                    },
                  },
                ],
              },
              "caption",
            ),
          ]),
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage,
    });

    expect(report.manifest.users[0]?.stories[0]?.stickers).toStrictEqual([
      "@friend",
      "Track - Artist",
      "#summer",
      "https://example.com/a",
    ]);
    expect(report.output.users[0]?.stories[0]?.locations).toStrictEqual([
      "Cafe Example, 1 Rue Example, Paris",
      "Cafe Example, 1 Rue Example, Paris",
    ]);
  });

  test("unwraps instagram redirect links inside sticker summaries", async (context) => {
    const { storyRepository, storyStorage } = createStoryFixtures(context);
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [
        reelsResponse({
          r1: reel("r1", [
            storyItemWithStickers(
              "m1",
              {
                link: {
                  title: "Visit Link",
                  url: "https://l.instagram.com/?u=https%3A%2F%2Flink.example.test%2Ffixture%3Ftoken%3Dfixture-token-1",
                },
              },
              "caption",
            ),
          ]),
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage,
    });

    expect(report.output.users[0]?.stories[0]?.stickers).toStrictEqual([
      "Visit Link (https://link.example.test/fixture?token=fixture-token-1)",
    ]);
  });

  test("stops when the tray cannot be fetched, without requesting any reel", async (context) => {
    const { storyRepository, storyStorage } = createStoryFixtures(context);
    const logger = createCapturingLogger();
    const client = createClient([], []);
    client.getTray = async () =>
      await Promise.resolve(
        response({ broadcasts: [], story_ranking_token: "", status: "fail", tray: [] }, 429),
      );

    await expect(
      fetchStoriesManifest(client, {
        logger,
        maxAttempts: 1,
        now: fixedNow,
        sleep: noSleep,
        storyRepository,
        storyStorage,
      }),
    ).rejects.toThrow(/Instagram request failed with HTTP 429/u);
    expect(client.reelsCalls).toEqual([]);
    assert.ok(
      logger.messages.some((message) =>
        message.includes("error: tray fetch failed: Instagram request failed with HTTP 429"),
      ),
    );
  });

  test("falls back after chunk failure and records failed stories", async (context) => {
    const { storyRepository, storyStorage } = createStoryFixtures(context);
    const logger = createCapturingLogger();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [reelsResponse({}, 500), reelsResponse({}, 500)],
    );

    const report = await fetchStoriesManifest(client, {
      logger,
      maxAttempts: 1,
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage,
    });

    expect(client.reelsCalls).toStrictEqual([["r1"], ["r1"]]);
    expect(report.manifest.users[0]?.stories[0]?.status).toBe("failed");
    expect(report.failures).toStrictEqual([
      {
        attempt_count: 1,
        http_status: 500,
        media_pk: "m1",
        message: "Instagram request failed with HTTP 500",
        reason: "request_failed",
        reel_id: "r1",
      },
    ]);
    expect(
      logger.messages.some((message) =>
        message.includes(
          "error: story failed: reel_id=r1 media_pk=m1 reason=request_failed status=500 attempts=1",
        ),
      ),
    ).toBeTruthy();
  });

  test("records missing stories when Instagram omits expected media", async (context) => {
    const { storyRepository, storyStorage } = createStoryFixtures(context);
    const client = createClient(
      [{ id: "r1", media_ids: ["m1", "m2"], user: { username: "one" } }],
      [
        reelsResponse({
          r1: reel("r1", [storyItem("m1")]),
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage,
    });

    expect(report.manifest.users[0]?.stories.map((story) => story.status)).toStrictEqual([
      "ok",
      "failed",
    ]);
    expect(report.failures[0]?.reason).toBe("missing_from_response");
    expect(report.failures[0]?.media_pk).toBe("m2");
  });

  test("stops further live fetches after rate limiting", async (context) => {
    const { storyRepository, storyStorage } = createStoryFixtures(context);
    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [reelsResponse({}, 429, { "retry-after": "1" })],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      maxAttempts: 1,
      now: fixedNow,
      reelIdsPerRequest: 1,
      sleep: noSleep,
      storyRepository,
      storyStorage,
    });

    expect(client.reelsCalls).toStrictEqual([["r1"]]);
    expect(
      report.manifest.users.flatMap((user) => user.stories.map((story) => story.status)),
    ).toStrictEqual(["failed", "failed"]);
    expect(
      report.failures.map((failure) => ({
        media_pk: failure.media_pk,
        reason: failure.reason,
      })),
    ).toStrictEqual([
      { media_pk: "m1", reason: "rate_limited" },
      { media_pk: "m2", reason: "rate_limited" },
    ]);
  });
});
