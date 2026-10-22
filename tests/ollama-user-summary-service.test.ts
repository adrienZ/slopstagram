import assert from "node:assert/strict";
import process from "node:process";
import { describe, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { readUserSummaries, resolveUserSummariesForReport } from "../sdk/user-summary.ts";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import { createMockLogger, createSummaryReport } from "./mock-helpers.ts";
import { createUserSummaryRepositoryAdapter } from "./repository-adapters.ts";

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

function requestBodyToString(body: BodyInit | null | undefined): string {
  return z.string().parse(body);
}

describe("resolveUserSummariesForReport", () => {
  for (const [platform, architecture, expectedModel] of [
    ["darwin", "arm64", "qwen3.5:0.8b-mlx"],
    ["darwin", "x64", "qwen3.5:0.8b"],
    ["linux", "x64", "qwen3.5:0.8b"],
    ["win32", "x64", "qwen3.5:0.8b"],
    ["win32", "arm64", "qwen3.5:0.8b"],
  ] as const) {
    test(`generates and reuses summaries with ${expectedModel} on ${platform}/${architecture}`, async (context) => {
      const report = createSummaryReport();
      const repository = createUserSummaryRepositoryAdapter();
      const logger = createMockLogger();
      context.mock.property(process, "platform", platform);
      context.mock.property(process, "arch", architecture);

      const summaries = await resolveUserSummariesForReport(report, {
        logger,
        repository,
        fetchOllama: async (_url, init) => {
          const body = UserSummaryRequestSchema.parse(JSON.parse(requestBodyToString(init?.body)));
          assert.equal(body.model, expectedModel);
          return new globalThis.Response(
            JSON.stringify({ response: JSON.stringify({ summary: "Platform summary." }) }),
          );
        },
      });

      assert.equal(summaries.get("summaryuser"), "Platform summary.");
      assert.deepEqual(readUserSummaries(report.output.users, { repository }), summaries);
    });
  }

  test("reuses successful user summaries from the repository", async () => {
    const repository = createUserSummaryRepositoryAdapter();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);
    assert.equal(userKey, "summaryuser");
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
        assert.match(prompt, /A food stall with readable prices\./u);
        assert.match(prompt, /Paris Market/u);
        assert.doesNotMatch(prompt, /May be food/u);
        assert.doesNotMatch(prompt, /menu prices/u);
        assert.doesNotMatch(prompt, /ig_caption/u);
        assert.doesNotMatch(prompt, /ocr_text/u);
        assert.doesNotMatch(prompt, /"status"/u);
        assert.doesNotMatch(prompt, /"ok"/u);
        assert.match(prompt, /Réponds en français\./u);

        return JSON.stringify({
          summary:
            "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
        });
      },
      repository,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      visionByPreviewUrl,
      runUserSummary: async () => {
        runCount += 1;
        return "should not be used";
      },
      repository,
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

  test("uses the Ollama model in the repository identity", async () => {
    const repository = createUserSummaryRepositoryAdapter();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);
    let runCount = 0;

    const first = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "default model summary" });
      },
      repository,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      model: "different-model",
      runUserSummary: async () => {
        runCount += 1;
        return JSON.stringify({ summary: "custom model summary" });
      },
      repository,
    });

    assert.equal(first.get(userKey), "default model summary");
    assert.equal(second.get(userKey), "custom model summary");
    assert.equal(runCount, 2);
  });

  test("runs the default Ollama client with qwen3.5 and OLLAMA_HOST", async (context) => {
    context.mock.property(process, "env", {
      ...process.env,
      OLLAMA_HOST: "http://summary.example:11434/api/generate",
    });
    const repository = createUserSummaryRepositoryAdapter();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      fetchOllama: async (url, init) => {
        assert.equal(url, "http://summary.example:11434/api/generate");
        const body = UserSummaryRequestSchema.parse(JSON.parse(requestBodyToString(init?.body)));

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

        return new globalThis.Response(
          JSON.stringify({
            response: JSON.stringify({ summary: "sdk summary" }),
          }),
          { status: 200 },
        );
      },
      repository,
    });

    assert.equal(summaries.get(userKey), "sdk summary");
  });

  test("honors a custom timeout for a blocked summary request", { timeout: 1000 }, async () => {
    const repository = createUserSummaryRepositoryAdapter();
    let requestSignal: AbortSignal | null | undefined;
    const result = resolveUserSummariesForReport(createSummaryReport(), {
      logger: createMockLogger(),
      repository,
      timeoutMs: 5,
      fetchOllama: async (_url, init) => {
        requestSignal = init?.signal;
        assert.ok(requestSignal);
        await delay(10_000, undefined, { signal: requestSignal });
        return globalThis.Response.json({ response: "too late" });
      },
    });

    const summaries = await result;
    assert.equal(summaries.get("summaryuser"), "résumé indisponible");
    assert.ok(requestSignal);
    assert.equal(requestSignal.aborted, true);
    assert.equal(repository.entries.size, 0);
  });

  test("returns fallback text when user summary fails", async () => {
    const repository = createUserSummaryRepositoryAdapter();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => {
        throw new Error("not signed in");
      },
      repository,
    });

    assert.equal(summaries.get(userKey), "résumé indisponible");
  });

  test("uses report fallback and does not store empty user summary responses", async () => {
    const repository = createUserSummaryRepositoryAdapter();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => "",
      repository,
    });
    assert.equal(
      summaries.get(userKey),
      "Summary User a partagé 1 story. Éléments visibles: location:Paris; Paris Market, 10 Rue Food, Paris.",
    );
    assert.equal(repository.entries.size, 0);
  });
});
