import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createConsola } from "consola";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import {
  createCacheStorages,
  getUserSummaryCacheKey,
} from "../scripts/lib/cache-service.ts";
import {
  USER_SUMMARY_MODEL,
  USER_SUMMARY_UNAVAILABLE,
  resolveUserSummariesForReport,
} from "../scripts/lib/user-summary-service.ts";
import type { Logger } from "../scripts/lib/logging-service.ts";
import { getReportUserKey } from "../scripts/lib/report-user-key-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

function createMockLogger(): Logger {
  const logger = createConsola();

  logger.mockTypes(() => {
    const log = () => {};
    log.raw = log;

    return log;
  });

  return Object.assign(logger, {
    progress: () => {},
  });
}

function createReport(): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [],
    },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 0,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 0,
        stories: 1,
      },
      created_at: "2026-07-26T09:48:26.773Z",
      report_name: "stories-report.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: "Summary User",
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "street food menu",
              ig_caption: "Photo by Summary User on July 26, 2026. May be food.",
              locations: ["Paris Market, 10 Rue Food, Paris"],
              media_pk: "story-pk",
              preview_image_url: "https://example.com/story.jpg",
              stickers: ["location:Paris"],
              status: "ok",
            },
          ],
          username: "summaryuser",
        },
      ],
    },
  };
}

describe("resolveUserSummariesForReport", () => {
  test("caches successful user summaries", async () => {
    const { userSummaryStorage: UserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);
    const visionByPreviewUrl = new Map([
      [
        "https://example.com/story.jpg",
        {
          text: "menu prices",
          visual: "A food stall with readable prices.",
        },
      ],
    ]);
    let runCount = 0;

    const first = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      visionByPreviewUrl,
      runUserSummary: async (prompt) => {
        runCount += 1;
        assert.match(prompt, /A food stall with readable prices\./);
        assert.match(prompt, /Paris Market/);
        assert.doesNotMatch(prompt, /May be food/);
        assert.doesNotMatch(prompt, /menu prices/);
        assert.doesNotMatch(prompt, /ig_caption/);
        assert.doesNotMatch(prompt, /ocr_text/);
        assert.doesNotMatch(prompt, /"status"/);
        assert.doesNotMatch(prompt, /"ok"/);
        assert.match(prompt, /Réponds en français\./);

        return JSON.stringify({
          summary:
            "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
        });
      },
      storage: UserSummaryStorage,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      visionByPreviewUrl,
      runUserSummary: async () => {
        runCount += 1;
        return "should not be used";
      },
      storage: UserSummaryStorage,
    });

    assert.equal(
      first.get(userKey),
      "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
    );
    assert.equal(
      second.get(userKey),
      "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
    );
    assert.equal(runCount, 1);
  });

  test("uses the Ollama model in the cache identity", async () => {
    const { userSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);
    let runCount = 0;

    const first = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "default model summary" });
      },
      storage: userSummaryStorage,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      model: "different-model",
      runUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "custom model summary" });
      },
      storage: userSummaryStorage,
    });

    assert.equal(USER_SUMMARY_MODEL, "qwen3.5:0.8b-mlx");
    assert.equal(first.get(userKey), "default model summary");
    assert.equal(second.get(userKey), "custom model summary");
    assert.equal(runCount, 2);
  });

  test("runs the default Ollama client with qwen3.5", async () => {
    const { userSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      fetchOllama: async (url, init) => {
        assert.match(String(url), /\/api\/generate$/);
        const body = JSON.parse(String(init?.body)) as {
          format?: unknown;
          model?: unknown;
          options?: unknown;
          prompt?: unknown;
          stream?: unknown;
          think?: unknown;
        };

        assert.equal(body.model, "qwen3.5:0.8b-mlx");
        assert.equal(body.stream, false);
        assert.deepEqual(body.options, {
          num_predict: 300,
          temperature: 0.2,
        });
        assert.equal(body.think, false);
        assert.deepEqual(body.format, {
          additionalProperties: false,
          properties: {
            summary: {
              type: "string",
            },
          },
          required: ["summary"],
          type: "object",
        });
        assert.doesNotMatch(String(body.prompt), /May be food/);
        assert.doesNotMatch(String(body.prompt), /menu prices/);

        return new Response(
          JSON.stringify({
            response: JSON.stringify({ summary: "sdk summary" }),
          }),
          { status: 200 },
        );
      },
      storage: userSummaryStorage,
    });

    assert.equal(summaries.get(userKey), "sdk summary");
  });

  test("returns fallback text when user summary fails", async () => {
    const { userSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => {
        throw new Error("not signed in");
      },
      storage: userSummaryStorage,
    });

    assert.equal(summaries.get(userKey), USER_SUMMARY_UNAVAILABLE);
  });

  test("uses report fallback and does not cache empty user summary responses", async () => {
    const { userSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => "",
      storage: userSummaryStorage,
    });
    const keys = await userSummaryStorage.getKeys();

    assert.equal(
      summaries.get(userKey),
      "Summary User a partagé 1 story. Éléments visibles: location:Paris; Paris Market, 10 Rue Food, Paris.",
    );
    assert.deepEqual(keys, []);
  });

  test("ignores cached unavailable summaries and regenerates them", async () => {
    const { userSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const sourceHash = "bad-cache-key";
    const cacheKey = getUserSummaryCacheKey(sourceHash);
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);
    let runCount = 0;

    await userSummaryStorage.setItem(cacheKey, {
      prompt: "Résume cet utilisateur Instagram en 2 ou 3 phrases en français.",
      result: USER_SUMMARY_UNAVAILABLE,
      source_hash: sourceHash,
      user_key: userKey,
    });

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "regenerated summary" });
      },
      storage: {
        ...userSummaryStorage,
        getItem: async (key: string) =>
          key === getUserSummaryCacheKey(sourceHash)
            ? await userSummaryStorage.getItem(key)
            : await userSummaryStorage.getItem(cacheKey),
      },
    });

    assert.equal(summaries.get(userKey), "regenerated summary");
    assert.equal(runCount, 1);
  });
});
