import process from "node:process";
import { assert, describe, test, vi, expect } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { readUserSummaries, resolveUserSummariesForReport } from "../sdk/user-summary.ts";
import { getReportUserKey } from "../sdk/lib/report-user-key-service.ts";
import { createMockLogger, createSummaryReport } from "./mock-helpers.ts";
import { createSummaryFixtures } from "./test-database.ts";

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
      const { repository } = await createSummaryFixtures(context);
      const logger = createMockLogger();
      vi.spyOn(process, "platform", "get").mockImplementation(() => platform);
      vi.spyOn(process, "arch", "get").mockImplementation(() => architecture);

      const summaries = await resolveUserSummariesForReport(report, {
        logger,
        repository,
        fetchOllama: async (_url, init) => {
          const body = UserSummaryRequestSchema.parse(JSON.parse(requestBodyToString(init?.body)));
          expect(body.model).toBe(expectedModel);
          return new globalThis.Response(
            JSON.stringify({ response: JSON.stringify({ summary: "Platform summary." }) }),
          );
        },
      });

      expect(summaries.get("summaryuser")).toBe("Platform summary.");
      expect(readUserSummaries(report.output.users, { repository })).toStrictEqual(summaries);
    });
  }

  test("reuses successful user summaries from the repository", async (context) => {
    const { repository } = await createSummaryFixtures(context);
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);
    expect(userKey).toBe("summaryuser");
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
        expect(prompt).toMatch(/A food stall with readable prices\./u);
        expect(prompt).toMatch(/Paris Market/u);
        expect(prompt).not.toMatch(/May be food/u);
        expect(prompt).not.toMatch(/menu prices/u);
        expect(prompt).not.toMatch(/ig_caption/u);
        expect(prompt).not.toMatch(/ocr_text/u);
        expect(prompt).not.toMatch(/"status"/u);
        expect(prompt).not.toMatch(/"ok"/u);
        expect(prompt).toMatch(/Réponds en français\./u);

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

    expect(first.get(userKey)).toBe(
      "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
    );
    expect(second.get(userKey)).toBe(
      "Summary User shared a Paris food story with a visible menu. The post centers on street food and readable prices.",
    );
    expect(runCount).toBe(1);
  });

  test("uses the Ollama model in the repository identity", async (context) => {
    const { repository } = await createSummaryFixtures(context);
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

    expect(first.get(userKey)).toBe("default model summary");
    expect(second.get(userKey)).toBe("custom model summary");
    expect(runCount).toBe(2);
  });

  test("runs the default Ollama client with qwen3.5 and OLLAMA_HOST", async (context) => {
    vi.stubEnv("OLLAMA_HOST", "http://summary.example:11434/api/generate");
    const { repository } = await createSummaryFixtures(context);
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      fetchOllama: async (url, init) => {
        expect(url).toBe("http://summary.example:11434/api/generate");
        const body = UserSummaryRequestSchema.parse(JSON.parse(requestBodyToString(init?.body)));

        expect(body.stream).toBe(false);
        expect(body.options).toStrictEqual({
          num_predict: 300,
          temperature: 0.2,
        });
        expect(body.think).toBe(false);
        expect(body.format.additionalProperties).toBe(false);
        expect(body.format.type).toBe("object");
        expect(body.format.properties.summary.type).toBe("string");
        expect(body.format.required.toSorted()).toStrictEqual(["summary"]);
        expect(String(body.prompt)).not.toMatch(/May be food/u);
        expect(String(body.prompt)).not.toMatch(/menu prices/u);

        return new globalThis.Response(
          JSON.stringify({
            response: JSON.stringify({ summary: "sdk summary" }),
          }),
          { status: 200 },
        );
      },
      repository,
    });

    expect(summaries.get(userKey)).toBe("sdk summary");
  });

  test(
    "honors a custom timeout for a blocked summary request",
    { timeout: 1000 },
    async (context) => {
      const { countSummaries, repository } = await createSummaryFixtures(context);
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
      expect(summaries.get("summaryuser")).toBe("résumé indisponible");
      assert.ok(requestSignal);
      expect(requestSignal.aborted).toBe(true);
      expect(countSummaries()).toBe(0);
    },
  );

  test("returns fallback text when user summary fails", async (context) => {
    const { repository } = await createSummaryFixtures(context);
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => {
        throw new Error("not signed in");
      },
      repository,
    });

    expect(summaries.get(userKey)).toBe("résumé indisponible");
  });

  test("uses report fallback and does not store a missing Ollama response", async (context) => {
    const { countSummaries, repository } = await createSummaryFixtures(context);
    const summaries = await resolveUserSummariesForReport(createSummaryReport(), {
      logger: createMockLogger(),
      fetchOllama: async () => globalThis.Response.json({ done: true }),
      repository,
    });

    expect(summaries.get("summaryuser")).toBe(
      "Summary User a partagé 1 story. Éléments visibles: location:Paris; Paris Market, 10 Rue Food, Paris.",
    );
    expect(countSummaries()).toBe(0);
  });

  test("uses report fallback and does not store empty user summary responses", async (context) => {
    const { countSummaries, repository } = await createSummaryFixtures(context);
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: async () => "",
      repository,
    });
    expect(summaries.get(userKey)).toBe(
      "Summary User a partagé 1 story. Éléments visibles: location:Paris; Paris Market, 10 Rue Food, Paris.",
    );
    expect(countSummaries()).toBe(0);
  });
});
