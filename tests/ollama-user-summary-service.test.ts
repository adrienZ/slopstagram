import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import {
  createCacheStorages,
  getOllamaUserSummaryCacheKey,
} from "../scripts/lib/cache-service.ts";
import {
  OLLAMA_USER_SUMMARY_MODEL,
  OLLAMA_USER_SUMMARY_UNAVAILABLE,
  resolveOllamaUserSummariesForReport,
} from "../scripts/lib/ollama-user-summary-service.ts";
import { getReportUserKey } from "../scripts/lib/report-user-key-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

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

describe("resolveOllamaUserSummariesForReport", () => {
  test("caches successful Ollama summaries", async () => {
    const { ollamaUserSummaryStorage } = createCacheStorages(
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

    const first = await resolveOllamaUserSummariesForReport(report, {
      visionByPreviewUrl,
      runOllamaUserSummary: async (prompt) => {
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
      storage: ollamaUserSummaryStorage,
    });
    const second = await resolveOllamaUserSummariesForReport(report, {
      visionByPreviewUrl,
      runOllamaUserSummary: async () => {
        runCount += 1;
        return "should not be used";
      },
      storage: ollamaUserSummaryStorage,
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
    const { ollamaUserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);
    let runCount = 0;

    const first = await resolveOllamaUserSummariesForReport(report, {
      runOllamaUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "default model summary" });
      },
      storage: ollamaUserSummaryStorage,
    });
    const second = await resolveOllamaUserSummariesForReport(report, {
      model: "different-model",
      runOllamaUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "custom model summary" });
      },
      storage: ollamaUserSummaryStorage,
    });

    assert.equal(OLLAMA_USER_SUMMARY_MODEL, "qwen3.5:0.8b-mlx");
    assert.equal(first.get(userKey), "default model summary");
    assert.equal(second.get(userKey), "custom model summary");
    assert.equal(runCount, 2);
  });

  test("runs the default Ollama client with qwen3.5", async () => {
    const { ollamaUserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);

    const summaries = await resolveOllamaUserSummariesForReport(report, {
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
      storage: ollamaUserSummaryStorage,
    });

    assert.equal(summaries.get(userKey), "sdk summary");
  });

  test("returns fallback text when Ollama summary fails", async () => {
    const { ollamaUserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);

    const summaries = await resolveOllamaUserSummariesForReport(report, {
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        progress: () => {},
        warn: () => {},
      },
      runOllamaUserSummary: async () => {
        throw new Error("not signed in");
      },
      storage: ollamaUserSummaryStorage,
    });

    assert.equal(summaries.get(userKey), OLLAMA_USER_SUMMARY_UNAVAILABLE);
  });

  test("uses report fallback and does not cache empty Ollama summary responses", async () => {
    const { ollamaUserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);

    const summaries = await resolveOllamaUserSummariesForReport(report, {
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        progress: () => {},
        warn: () => {},
      },
      runOllamaUserSummary: async () => "",
      storage: ollamaUserSummaryStorage,
    });
    const keys = await ollamaUserSummaryStorage.getKeys();

    assert.equal(
      summaries.get(userKey),
      "Summary User a partagé 1 story. Éléments visibles: location:Paris; Paris Market, 10 Rue Food, Paris.",
    );
    assert.deepEqual(keys, []);
  });

  test("ignores cached unavailable summaries and regenerates them", async () => {
    const { ollamaUserSummaryStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const sourceHash = "bad-cache-key";
    const cacheKey = getOllamaUserSummaryCacheKey(sourceHash);
    const report = createReport();
    const userKey = getReportUserKey(report.output.users[0]!);
    let runCount = 0;

    await ollamaUserSummaryStorage.setItem(cacheKey, {
      prompt: "Résume cet utilisateur Instagram en 2 ou 3 phrases en français.",
      result: OLLAMA_USER_SUMMARY_UNAVAILABLE,
      source_hash: sourceHash,
      user_key: userKey,
    });

    const summaries = await resolveOllamaUserSummariesForReport(report, {
      runOllamaUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "regenerated summary" });
      },
      storage: {
        ...ollamaUserSummaryStorage,
        getItem: async (key: string) =>
          key === getOllamaUserSummaryCacheKey(sourceHash)
            ? await ollamaUserSummaryStorage.getItem(key)
            : await ollamaUserSummaryStorage.getItem(cacheKey),
      },
    });

    assert.equal(summaries.get(userKey), "regenerated summary");
    assert.equal(runCount, 1);
  });
});
