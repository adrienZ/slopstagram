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
        accessibility_caption: user.stories[0]?.accessibility_caption,
        reel_id: user.reel_id,
        status: user.stories[0]?.status,
        username: user.username,
      })),
      [
        {
          accessibility_caption: "no caption avaible",
          reel_id: "r1",
          status: "cached",
          username: "one",
        },
        {
          accessibility_caption: "no caption avaible",
          reel_id: "r2",
          status: "cached",
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
            accessibility_caption: "no caption avaible",
            media_pk: "m1",
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
            accessibility_caption: "no caption avaible",
            media_pk: "m2",
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
      logger: createMockLogger(),
      now: fixedNow,
      sleep: noSleep,
      storyStorage: storiesStorage,
    });

    assert.deepEqual(client.reelsCalls, [["r2"]]);
    assert.equal(await storiesStorage.hasItem(getStoryCacheKey("m2")), true);
    assert.deepEqual(
      report.manifest.users.map((user) => ({
        accessibility_caption: user.stories[0]?.accessibility_caption,
        status: user.stories[0]?.status,
      })),
      [
        {
          accessibility_caption: "Cached image caption",
          status: "cached",
        },
        {
          accessibility_caption: "no caption avaible",
          status: "fetched",
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
            r1: reel("r1", [storyItem("m1", "First story caption")]),
            r2: reel("r2", [storyItem("m2", "Second story caption")]),
          },
        }),
      ],
    );

    const report = await fetchStoriesManifest(client, {
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
            accessibility_caption: "First story caption",
            media_pk: "m1",
            status: "fetched",
          },
          {
            accessibility_caption: "Second story caption",
            media_pk: "m2",
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

  test("falls back after chunk failure and records failed stories", async () => {
    const { storiesStorage } = createTestStorages();
    const logger = createMockLogger();
    const client = createClient(
      [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
      [response({}, 500), response({}, 500)],
    );

    const report = await fetchStoriesManifest(client, {
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
