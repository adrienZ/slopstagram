import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { z } from "zod";
import { getUserSummaryCacheKey } from "../sdk/lib/cache-service.ts";
import {
  USER_SUMMARY_MODEL,
  USER_SUMMARY_UNAVAILABLE,
  getUserSummaryModel,
  resolveUserSummariesForReport,
} from "../sdk/lib/user-summary-service.ts";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import {
  createMemoryCacheStorages,
  createMockLogger,
  createSummaryReport,
} from "./mock-helpers.ts";

const UserSummaryRequestSchema = z.object({
  format: z
    .object({
      additionalProperties: z.literal(false),
      properties: z.object({
        summary: z.object({
          type: z.literal("string"),
        }),
      }),
      required: z.array(z.string()),
      type: z.literal("object"),
    })
    .required(),
  model: z.unknown().optional(),
  options: z.unknown().optional(),
  prompt: z.unknown().optional(),
  stream: z.unknown().optional(),
  think: z.unknown().optional(),
});

describe("resolveUserSummariesForReport", () => {
  test("selects an OS-compatible summary model", () => {
    assert.equal(getUserSummaryModel("darwin", "arm64"), "qwen3.5:0.8b-mlx");
    assert.equal(getUserSummaryModel("darwin", "x64"), "qwen3.5:0.8b");
    assert.equal(getUserSummaryModel("linux", "x64"), "qwen3.5:0.8b");
  });

  test("never selects the MLX summary model on Windows", () => {
    for (const architecture of ["x64", "arm64"]) {
      const model = getUserSummaryModel("win32", architecture);

      assert.doesNotMatch(model, /mlx/u);
    }
  });

  test("caches successful user summaries", async () => {
    const { userSummaryStorage: UserSummaryStorage } = createMemoryCacheStorages();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);
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
      runUserSummary: (prompt) => {
        runCount += 1;
        assert.match(prompt, /A food stall with readable prices\./u);
        assert.match(prompt, /Paris Market/u);
        assert.doesNotMatch(prompt, /May be food/u);
        assert.doesNotMatch(prompt, /menu prices/u);
        assert.doesNotMatch(prompt, /ig_caption/u);
        assert.doesNotMatch(prompt, /ocr_text/u);
        assert.doesNotMatch(prompt, /"status"/u);
        assert.doesNotMatch(prompt, /"ok"/u);
        assert.match(prompt, /Réponds en français\./u);

        return Promise.resolve(
          JSON.stringify({
            summary:
              "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
          }),
        );
      },
      storage: UserSummaryStorage,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      visionByPreviewUrl,
      runUserSummary: () => {
        runCount += 1;
        return Promise.resolve("should not be used");
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
    const { userSummaryStorage } = createMemoryCacheStorages();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);
    let runCount = 0;

    const first = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: () => {
        runCount += 1;
        return Promise.resolve(JSON.stringify({ summary: "default model summary" }));
      },
      storage: userSummaryStorage,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      model: "different-model",
      runUserSummary: () => {
        runCount += 1;
        return Promise.resolve(JSON.stringify({ summary: "custom model summary" }));
      },
      storage: userSummaryStorage,
    });

    assert.equal(USER_SUMMARY_MODEL, getUserSummaryModel());
    assert.equal(first.get(userKey), "default model summary");
    assert.equal(second.get(userKey), "custom model summary");
    assert.equal(runCount, 2);
  });

  test("runs the default Ollama client with qwen3.5", async () => {
    const { userSummaryStorage } = createMemoryCacheStorages();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      fetchOllama: (url, init) => {
        // oxlint-disable-next-line typescript/no-base-to-string
        assert.match(String(url), /\/api\/generate$/u);
        // oxlint-disable-next-line typescript/no-base-to-string typescript/no-unsafe-type-assertion
        const body = UserSummaryRequestSchema.parse(JSON.parse(String(init?.body)));

        assert.equal(body.model, getUserSummaryModel());
        assert.equal(body.stream, false);
        assert.deepEqual(body.options, {
          num_predict: 300,
          temperature: 0.2,
        });
        assert.equal(body.think, false);
        assert.equal(body.format.additionalProperties, false);
        assert.equal(body.format.type, "object");
        assert.equal(body.format.properties.summary.type, "string");
        assert.deepEqual(body.format.required.toSorted(), ["summary"]);
        assert.doesNotMatch(String(body.prompt), /May be food/u);
        assert.doesNotMatch(String(body.prompt), /menu prices/u);

        return Promise.resolve(
          new globalThis.Response(
            JSON.stringify({
              response: JSON.stringify({ summary: "sdk summary" }),
            }),
            { status: 200 },
          ),
        );
      },
      storage: userSummaryStorage,
    });

    assert.equal(summaries.get(userKey), "sdk summary");
  });

  test("returns fallback text when user summary fails", async () => {
    const { userSummaryStorage } = createMemoryCacheStorages();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: () => {
        return Promise.reject(new Error("not signed in"));
      },
      storage: userSummaryStorage,
    });

    assert.equal(summaries.get(userKey), USER_SUMMARY_UNAVAILABLE);
  });

  test("uses report fallback and does not cache empty user summary responses", async () => {
    const { userSummaryStorage } = createMemoryCacheStorages();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: () => Promise.resolve(""),
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
    const { userSummaryStorage } = createMemoryCacheStorages();
    const sourceHash = "bad-cache-key";
    const cacheKey = getUserSummaryCacheKey(sourceHash);
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);
    let runCount = 0;

    await userSummaryStorage.setItem(cacheKey, {
      prompt: "Résume cet utilisateur Instagram en 2 ou 3 phrases en français.",
      result: USER_SUMMARY_UNAVAILABLE,
      source_hash: sourceHash,
      user_key: userKey,
    });

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: () => {
        runCount += 1;
        return Promise.resolve(JSON.stringify({ summary: "regenerated summary" }));
      },
      storage: {
        ...userSummaryStorage,
        getItem: (key: string) =>
          key === getUserSummaryCacheKey(sourceHash)
            ? userSummaryStorage.getItem(key)
            : userSummaryStorage.getItem(cacheKey),
      },
    });

    assert.equal(summaries.get(userKey), "regenerated summary");
    assert.equal(runCount, 1);
  });
});
