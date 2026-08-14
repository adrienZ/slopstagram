import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import {
  USER_SUMMARY_MODEL,
  USER_SUMMARY_PROMPT,
  USER_SUMMARY_UNAVAILABLE,
  getUserSummaryModel,
  getUserSummaryPromptHash,
} from "../sdk/lib/user-summary-core-service.ts";
import { resolveUserSummariesForReport } from "../sdk/lib/user-summary-resolver-service.ts";
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
      repository: repository,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      visionByPreviewUrl,
      runUserSummary: () => {
        runCount += 1;
        return Promise.resolve("should not be used");
      },
      repository: repository,
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
      runUserSummary: () => {
        runCount += 1;
        return Promise.resolve(JSON.stringify({ summary: "default model summary" }));
      },
      repository: repository,
    });
    const second = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      model: "different-model",
      runUserSummary: () => {
        runCount += 1;
        return Promise.resolve(JSON.stringify({ summary: "custom model summary" }));
      },
      repository: repository,
    });

    assert.equal(USER_SUMMARY_MODEL, getUserSummaryModel());
    assert.equal(first.get(userKey), "default model summary");
    assert.equal(second.get(userKey), "custom model summary");
    assert.equal(runCount, 2);
  });

  test("runs the default Ollama client with qwen3.5", async () => {
    const repository = createUserSummaryRepositoryAdapter();
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
      repository: repository,
    });

    assert.equal(summaries.get(userKey), "sdk summary");
  });

  test("returns fallback text when user summary fails", async () => {
    const repository = createUserSummaryRepositoryAdapter();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: () => {
        return Promise.reject(new Error("not signed in"));
      },
      repository: repository,
    });

    assert.equal(summaries.get(userKey), USER_SUMMARY_UNAVAILABLE);
  });

  test("uses report fallback and does not store empty user summary responses", async () => {
    const repository = createUserSummaryRepositoryAdapter();
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);

    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      runUserSummary: () => Promise.resolve(""),
      repository: repository,
    });
    assert.equal(
      summaries.get(userKey),
      "Summary User a partagé 1 story. Éléments visibles: location:Paris; Paris Market, 10 Rue Food, Paris.",
    );
    assert.equal(repository.entries.size, 0);
  });

  test("ignores stored unavailable summaries and regenerates them", async () => {
    const repository = createUserSummaryRepositoryAdapter();
    const sourceHash = "unavailable-source-hash";
    const report = createSummaryReport();
    const userKey = getReportUserKey(report.output.users[0]);
    let runCount = 0;

    repository.entries.set(sourceHash, {
      prompt_hash: getUserSummaryPromptHash(USER_SUMMARY_PROMPT),
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
      repository: {
        findBySourceHash: () => Promise.resolve(repository.entries.get(sourceHash) ?? null),
        save: repository.save,
      },
    });

    assert.equal(summaries.get(userKey), "regenerated summary");
    assert.equal(runCount, 1);
  });
});
