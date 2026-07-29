import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import {
  fetchStoriesManifest,
  type InstagramClient,
  type InstagramClientResponse,
} from "../scripts/fetch-stories.ts";
import {
  createCacheStorages,
  getStoryCacheKey,
} from "../scripts/lib/cache-service.ts";
import type { Logger } from "../scripts/lib/logging-service.ts";
import type { StoryItem, StoryReel, StoryTrayEntry } from "../scripts/lib/types.ts";

function storyItem(pk: string, accessibilityCaption?: string | null): StoryItem {
  return {
    accessibility_caption: accessibilityCaption,
    image_versions2: {
      candidates: [
        {
          height: 100,
          url: `https://example.com/${pk}.jpg`,
          width: 100,
        },
      ],
    },
    media_type: 1,
    pk,
  };
}

function storyItemWithStickers(
  pk: string,
  stickers: Partial<StoryItem>,
  accessibilityCaption?: string | null,
): StoryItem {
  return {
    ...storyItem(pk, accessibilityCaption),
    ...stickers,
  };
}

function reel(id: string, items: StoryItem[]): StoryReel {
  return {
    id,
    items,
    media_ids: items.map((item) => item.pk),
  };
}

function response<T>(
  value: T,
  status = 200,
  headers: Record<string, string> = {},
): InstagramClientResponse<T> {
  return {
    headers,
    json: async () => value,
    ok: status >= 200 && status < 300,
    status,
  };
}

function createTestStorages(): ReturnType<typeof createCacheStorages> {
  return createCacheStorages(
    createStorage({
      driver: memoryDriver(),
    }),
  );
}

function createClient(
  tray: StoryTrayEntry[],
  reelsResponses: Array<InstagramClientResponse<{ reels?: Record<string, StoryReel> }>>,
): InstagramClient & { reelsCalls: string[][] } {
  const reelsCalls: string[][] = [];

  return {
    reelsCalls,
    async getTray() {
      return response({
        broadcasts: [],
        status: "ok",
        story_ranking_token: "ranking-token",
        tray,
      });
    },
    async getReelsMedia(reelIds) {
      reelsCalls.push(reelIds);
      const nextResponse = reelsResponses.shift();

      if (!nextResponse) {
        throw new Error("Unexpected reels media request");
      }

      return nextResponse;
    },
  };
}

const fixedNow = () => new Date("2026-07-26T00:00:00.000Z");
const noSleep = async () => {};
const resolveAppleCaption = async (story: StoryItem) =>
  `apple:${story.pk}`;

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];

  return {
    debug: (message) => {
      messages.push(`debug: ${message}`);
    },
    error: (message) => {
      messages.push(`error: ${message}`);
    },
    info: (message) => {
      messages.push(`info: ${message}`);
    },
    messages,
    progress: (label, current, total) => {
      messages.push(`progress: ${label} ${current}/${total}`);
    },
    warn: (message) => {
      messages.push(`warn: ${message}`);
    },
  };
}

describe("fetchStoriesManifest", () => {
  test("uses cached media items without calling reels media", async () => {
    const { storiesStorage } = createTestStorages();
    await storiesStorage.setItem(getStoryCacheKey("m1"), storyItem("m1"));
    await storiesStorage.setItem(getStoryCacheKey("m2"), storyItem("m2"));

    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [],
    );

    const report = await fetchStoriesManifest(client, {
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
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
        apple_caption: user.stories[0]?.apple_caption,
        ig_caption: user.stories[0]?.ig_caption,
        reel_id: user.reel_id,
        status: user.stories[0]?.status,
        stickers: user.stories[0]?.stickers,
        username: user.username,
      })),
      [
        {
          apple_caption: "apple:m1",
          ig_caption: "no caption avaible",
          reel_id: "r1",
          status: "cached",
          stickers: [],
          username: "one",
        },
        {
          apple_caption: "apple:m2",
          ig_caption: "no caption avaible",
          reel_id: "r2",
          status: "cached",
          stickers: [],
          username: "two",
        },
      ],
    );
    assert.deepEqual(report.output.users, [
      {
        full_name: null,
        reel_ids: ["r1"],
        stories: [
          {
            apple_caption: "apple:m1",
            ig_caption: "no caption avaible",
            media_pk: "m1",
            stickers: [],
            status: "cached",
          },
        ],
        username: "one",
      },
      {
        full_name: null,
        reel_ids: ["r2"],
        stories: [
          {
            apple_caption: "apple:m2",
            ig_caption: "no caption avaible",
            media_pk: "m2",
            stickers: [],
            status: "cached",
          },
        ],
        username: "two",
      },
    ]);
  });

  test("fetches only reels with missing media and caches returned items", async () => {
    const { storiesStorage } = createTestStorages();
    await storiesStorage.setItem(
      getStoryCacheKey("m1"),
      storyItem("m1", "Cached image caption"),
    );

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
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(client.reelsCalls, [["r2"]]);
    assert.equal(await storiesStorage.hasItem(getStoryCacheKey("m2")), true);
    assert.deepEqual(
      report.manifest.users.map((user) => ({
        apple_caption: user.stories[0]?.apple_caption,
        ig_caption: user.stories[0]?.ig_caption,
        status: user.stories[0]?.status,
        stickers: user.stories[0]?.stickers,
      })),
      [
        {
          apple_caption: "apple:m1",
          ig_caption: "Cached image caption",
          status: "cached",
          stickers: [],
        },
        {
          apple_caption: "apple:m2",
          ig_caption: "no caption avaible",
          status: "fetched",
          stickers: [],
        },
      ],
    );
    assert.equal(report.metadata.counts.cache_hits, 1);
    assert.equal(report.metadata.counts.fetched, 1);
  });

  test("groups final output by user with story accessibility captions", async () => {
    const { storiesStorage } = createTestStorages();
    const client = createClient(
      [
        {
          id: "r1",
          media_ids: ["m1"],
          user: { full_name: "Same User", username: "same" },
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
            r1: reel(
              "r1",
              [
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
              ],
            ),
            r2: reel("r2", [storyItem("m2", "Second story caption")]),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(report.output.users, [
      {
        full_name: "Same User",
        reel_ids: ["r1", "r2"],
        stories: [
          {
            apple_caption: "apple:m1",
            ig_caption: "First story caption",
            media_pk: "m1",
            stickers: ["mention:@same"],
            status: "fetched",
          },
          {
            apple_caption: "apple:m2",
            ig_caption: "Second story caption",
            media_pk: "m2",
            stickers: [],
            status: "fetched",
          },
        ],
        username: "same",
      },
    ]);
  });

  test("preserves tray and media order in the manifest", async () => {
    const { storiesStorage } = createTestStorages();
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
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(
      report.manifest.users.map((user) => ({
        media_ids: user.media_ids,
        reel_id: user.reel_id,
      })),
      [
        { media_ids: ["m2", "m3"], reel_id: "r2" },
        { media_ids: ["m1"], reel_id: "r1" },
      ],
    );
  });

  test("extracts sticker summaries from story payload", async () => {
    const { storiesStorage } = createTestStorages();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [
        response({
          reels: {
            r1: reel(
              "r1",
              [
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
                    ],
                    story_hashtags: [{ hashtag: "summer" }],
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
              ],
            ),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(report.manifest.users[0]?.stories[0]?.stickers, [
      "mention:@friend",
      "music:Track - Artist",
      "hashtag:#summer",
      "link:https://example.com/a",
    ]);
    assert.deepEqual(report.output.users[0]?.stories[0]?.stickers, [
      "mention:@friend",
      "music:Track - Artist",
      "hashtag:#summer",
      "link:https://example.com/a",
    ]);
  });

  test("unwraps instagram redirect links inside sticker summaries", async () => {
    const { storiesStorage } = createTestStorages();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [
        response({
          reels: {
            r1: reel(
              "r1",
              [
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
              ],
            ),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(report.output.users[0]?.stories[0]?.stickers, [
      "link:Visit Link (https://installclaw.io/fr?fbclid=PAcGRvZgRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZAwyNTYyODEwNDA1NTgAAaees2JVYiKznrVRdrE8jUP0t055Ywo5c27Qe7zZvMdkJw4mRFLCM-_N39601g_aem_zcP2VBsrm0eIv1jimc94uQ)",
    ]);
  });

  test("falls back after chunk failure and records failed stories", async () => {
    const { storiesStorage } = createTestStorages();
    const logger = createMockLogger();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [response({}, 500), response({}, 500)],
    );

    const report = await fetchStoriesManifest(client, {
      appleCaptionResolver: resolveAppleCaption,
      logger,
      maxAttempts: 1,
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(client.reelsCalls, [["r1"], ["r1"]]);
    assert.equal(report.manifest.users[0]?.stories[0]?.status, "failed");
    assert.deepEqual(report.failures, [
      {
        attempt_count: 1,
        http_status: 500,
        media_pk: "m1",
        message: "Instagram request failed with HTTP 500",
        reason: "request_failed",
        reel_id: "r1",
      },
    ]);
    assert.ok(
      logger.messages.some((message) =>
        message.includes(
          "error: story failed: reel_id=r1 media_pk=m1 reason=request_failed status=500 attempts=1",
        ),
      ),
    );
  });

  test("records missing stories when Instagram omits expected media", async () => {
    const { storiesStorage } = createTestStorages();
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
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(
      report.manifest.users[0]?.stories.map((story) => story.status),
      ["fetched", "failed"],
    );
    assert.equal(report.failures[0]?.reason, "missing_from_response");
    assert.equal(report.failures[0]?.media_pk, "m2");
  });

  test("stops further live fetches after rate limiting", async () => {
    const { storiesStorage } = createTestStorages();
    const client = createClient(
      [
        { id: "r1", media_ids: ["m1"], user: { username: "one" } },
        { id: "r2", media_ids: ["m2"], user: { username: "two" } },
      ],
      [response({}, 429, { "retry-after": "1" })],
    );

    const report = await fetchStoriesManifest(client, {
      appleCaptionResolver: resolveAppleCaption,
      logger: createMockLogger(),
      maxAttempts: 1,
      now: fixedNow,
      reelIdsPerRequest: 1,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(client.reelsCalls, [["r1"]]);
    assert.deepEqual(
      report.manifest.users.flatMap((user) =>
        user.stories.map((story) => story.status),
      ),
      ["failed", "failed"],
    );
    assert.deepEqual(
      report.failures.map((failure) => ({
        media_pk: failure.media_pk,
        reason: failure.reason,
      })),
      [
        { media_pk: "m1", reason: "rate_limited" },
        { media_pk: "m2", reason: "rate_limited" },
      ],
    );
  });
});
