import assert from "node:assert/strict";
import { test } from "vitest";
import { createReportViewModel } from "../server/report-view-model.ts";
import type { StoriesManifestReport } from "../sdk/report-types.ts";
import type { UserSummaryEntry } from "../sdk/entities/user-summary.ts";
import { readUserSummaries, resolveUserSummariesForReport } from "../sdk/user-summary.ts";
import { createMockLogger, createSummaryReport } from "./mock-helpers.ts";
import { createUserSummaryRepositoryAdapter } from "./repository-adapters.ts";

async function createStoredSummary() {
  const report = createSummaryReport();
  const repository = createUserSummaryRepositoryAdapter();
  await resolveUserSummariesForReport(report, {
    logger: createMockLogger(),
    repository,
    runUserSummary: async () => JSON.stringify({ summary: "Résumé initial." }),
  });
  const entry = repository.entries.values().next().value;
  assert.ok(entry);
  return { entry, report, repository };
}

function readFeedSummaries(
  report: StoriesManifestReport,
  repository: ReturnType<typeof createUserSummaryRepositoryAdapter>,
) {
  return createReportViewModel(report.output.users, {
    appleVision: { findByMediaPk: () => null },
    userSummary: repository,
    vision: { findByMediaPk: () => null },
  }).userSummaryByUserKey;
}

test("feed and collection normalize stored summaries identically without rewriting them", async () => {
  const { entry, report, repository } = await createStoredSummary();
  entry.result = "  Cafe\u0301\n  et\tmarche\u0301.  ";
  const storedResult = entry.result;
  const feedSummaries = readFeedSummaries(report, repository);
  const collectionSummaries = await resolveUserSummariesForReport(report, {
    logger: createMockLogger(),
    repository,
    runUserSummary: async () => {
      assert.fail("a usable stored summary must not be regenerated");
    },
  });

  assert.equal(feedSummaries.get(entry.user_key), "Café et marché.");
  assert.deepEqual(collectionSummaries, feedSummaries);
  assert.equal(repository.entries.get(entry.source_hash)?.result, storedResult);
});

for (const [name, result] of [
  ["empty", ""],
  ["whitespace", " \n\t "],
  ["unavailable", "résumé indisponible"],
  ["decomposed Unicode and repeated whitespace", "  re\u0301sume\u0301\n  indisponible  "],
]) {
  test(`feed hides and collection regenerates a matching ${name} summary`, async () => {
    const { entry, report, repository } = await createStoredSummary();
    entry.result = result;
    assert.equal(readFeedSummaries(report, repository).size, 0);
    let generations = 0;
    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      repository,
      runUserSummary: async () => {
        generations += 1;
        return JSON.stringify({ summary: "Résumé régénéré." });
      },
    });

    assert.equal(generations, 1);
    assert.equal(summaries.get(entry.user_key), "Résumé régénéré.");
    assert.deepEqual(readFeedSummaries(report, repository), summaries);
  });
}

for (const field of ["source_hash", "prompt_hash", "user_key"] as const) {
  test(`feed and collection reject a stored summary with a mismatched ${field}`, async () => {
    const { entry, report, repository } = await createStoredSummary();
    const invalidEntry: UserSummaryEntry = { ...entry, [field]: "mismatched" };
    repository.entries.set(entry.source_hash, invalidEntry);
    assert.equal(readFeedSummaries(report, repository).size, 0);
    let generations = 0;
    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      repository,
      runUserSummary: async () => {
        generations += 1;
        return JSON.stringify({ summary: "Résumé corrigé." });
      },
    });

    assert.equal(generations, 1);
    assert.equal(summaries.get(entry.user_key), "Résumé corrigé.");
    assert.deepEqual(readFeedSummaries(report, repository), summaries);
  });
}

test("changed story content hides the old summary until collection regenerates it", async () => {
  const { entry, report, repository } = await createStoredSummary();
  report.output.users[0].stories[0].stickers.push("#food");
  assert.equal(readFeedSummaries(report, repository).size, 0);
  const summaries = await resolveUserSummariesForReport(report, {
    logger: createMockLogger(),
    repository,
    runUserSummary: async () => JSON.stringify({ summary: "Une story de cuisine." }),
  });

  assert.equal(summaries.get(entry.user_key), "Une story de cuisine.");
  assert.deepEqual(readFeedSummaries(report, repository), summaries);
});

test("a changed model requires its own summary for both reading and generation", async () => {
  const { entry, report, repository } = await createStoredSummary();
  const options = { repository, model: "new-model" };
  assert.equal(readUserSummaries(report.output.users, options).size, 0);
  const summaries = await resolveUserSummariesForReport(report, {
    ...options,
    logger: createMockLogger(),
    runUserSummary: async () => JSON.stringify({ summary: "Résumé du nouveau modèle." }),
  });

  assert.equal(summaries.get(entry.user_key), "Résumé du nouveau modèle.");
  assert.deepEqual(readUserSummaries(report.output.users, options), summaries);
  assert.equal(readFeedSummaries(report, repository).get(entry.user_key), "Résumé initial.");
});

for (const outcome of ["empty", "error"] as const) {
  test(`a generation ${outcome} leaves no stored summary for the feed`, async () => {
    const report = createSummaryReport();
    const repository = createUserSummaryRepositoryAdapter();
    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      repository,
      runUserSummary: async () => {
        if (outcome === "error") {
          throw new Error("model unavailable");
        }
        return "";
      },
    });

    assert.equal(summaries.size, 1);
    assert.equal(repository.entries.size, 0);
    assert.equal(readFeedSummaries(report, repository).size, 0);
  });
}
