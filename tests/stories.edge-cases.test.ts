import { describe, test, expect } from "vitest";
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

describe("fetchStoriesManifest edge cases", () => {
  test("preserves tray and media order in the manifest", async () => {
    const storyRepository = createMemoryStoryRepository();
    const client = createClient(
      [
        { id: "r2", media_ids: ["m2", "m3"], user: { username: "two" } },
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
      ],
      [
        response({
          reels: {
            r1: reel("r1", [storyItem("m1")]),
            r2: reel("r2", [storyItem("m3"), storyItem("m2")]),
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

  test("extracts sticker summaries from story payload", async () => {
    const storyRepository = createMemoryStoryRepository();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [
        response({
          reels: {
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

  test("unwraps instagram redirect links inside sticker summaries", async () => {
    const storyRepository = createMemoryStoryRepository();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [
        response({
          reels: {
            r1: reel("r1", [
              storyItemWithStickers(
                "m1",
                {
                  link: {
                    title: "Visit Link",
                    url: "https://l.instagram.com/?u=https%3A%2F%2Finstallclaw.io%2Ffr%3Ffbclid%3DPAcGRvZgRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZAwyNTYyODEwNDA1NTgAAaees2JVYiKznrVRdrE8jUP0t055Ywo5c27Qe7zZvMdkJw4mRFLCM-_N39601g_aem_zcP2VBsrm0eIv1jimc94uQ&e=AUCmysVsYFdNrKGJp7Q0gcfWAbjsWt8JpZDcBDd_-NHBcUmft9eEQIoVQXv-HKNBFJtz4zRPoRllkQBozb6cDjlBocBjgrb3rEYJr2zjkEG3ODw9GwudH1HSKA",
                  },
                },
                "caption",
              ),
            ]),
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

    expect(report.output.users[0]?.stories[0]?.stickers).toStrictEqual([
      "Visit Link (https://installclaw.io/fr?fbclid=PAcGRvZgRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZAwyNTYyODEwNDA1NTgAAaees2JVYiKznrVRdrE8jUP0t055Ywo5c27Qe7zZvMdkJw4mRFLCM-_N39601g_aem_zcP2VBsrm0eIv1jimc94uQ)",
    ]);
  });

  test("falls back after chunk failure and records failed stories", async () => {
    const storyRepository = createMemoryStoryRepository();
    const logger = createCapturingLogger();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [response({}, 500), response({}, 500)],
    );

    const report = await fetchStoriesManifest(client, {
      logger,
      maxAttempts: 1,
      now: fixedNow,
      sleep: noSleep,
      storyRepository,
      storyStorage: storyRepository.storyStorage,
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

  test("records missing stories when Instagram omits expected media", async () => {
    const storyRepository = createMemoryStoryRepository();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1", "m2"], user: { username: "one" } }],
      [
        response({
          reels: {
            r1: reel("r1", [storyItem("m1")]),
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

    expect(report.manifest.users[0]?.stories.map((story) => story.status)).toStrictEqual([
      "ok",
      "failed",
    ]);
    expect(report.failures[0]?.reason).toBe("missing_from_response");
    expect(report.failures[0]?.media_pk).toBe("m2");
  });

  test("stops further live fetches after rate limiting", async () => {
    const storyRepository = createMemoryStoryRepository();
    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [response({}, 429, { "retry-after": "1" })],
    );

    const report = await fetchStoriesManifest(client, {
      logger: createCapturingLogger(),
      maxAttempts: 1,
      now: fixedNow,
      reelIdsPerRequest: 1,
      sleep: noSleep,
      storyRepository,
      storyStorage: storyRepository.storyStorage,
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
