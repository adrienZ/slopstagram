import { assert, test, expect } from "vitest";
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
      expect.unreachable("a usable stored summary must not be regenerated");
    },
  });

  expect(feedSummaries.get(entry.user_key)).toBe("Café et marché.");
  expect(collectionSummaries).toStrictEqual(feedSummaries);
  expect(repository.entries.get(entry.source_hash)?.result).toBe(storedResult);
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
    expect(readFeedSummaries(report, repository).size).toBe(0);
    let generations = 0;
    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      repository,
      runUserSummary: async () => {
        generations += 1;
        return JSON.stringify({ summary: "Résumé régénéré." });
      },
    });

    expect(generations).toBe(1);
    expect(summaries.get(entry.user_key)).toBe("Résumé régénéré.");
    expect(readFeedSummaries(report, repository)).toStrictEqual(summaries);
  });
}

for (const field of ["source_hash", "prompt_hash", "user_key"] as const) {
  test(`feed and collection reject a stored summary with a mismatched ${field}`, async () => {
    const { entry, report, repository } = await createStoredSummary();
    const invalidEntry: UserSummaryEntry = { ...entry, [field]: "mismatched" };
    repository.entries.set(entry.source_hash, invalidEntry);
    expect(readFeedSummaries(report, repository).size).toBe(0);
    let generations = 0;
    const summaries = await resolveUserSummariesForReport(report, {
      logger: createMockLogger(),
      repository,
      runUserSummary: async () => {
        generations += 1;
        return JSON.stringify({ summary: "Résumé corrigé." });
      },
    });

    expect(generations).toBe(1);
    expect(summaries.get(entry.user_key)).toBe("Résumé corrigé.");
    expect(readFeedSummaries(report, repository)).toStrictEqual(summaries);
  });
}

test("changed story content hides the old summary until collection regenerates it", async () => {
  const { entry, report, repository } = await createStoredSummary();
  report.output.users[0].stories[0].stickers.push("#food");
  expect(readFeedSummaries(report, repository).size).toBe(0);
  const summaries = await resolveUserSummariesForReport(report, {
    logger: createMockLogger(),
    repository,
    runUserSummary: async () => JSON.stringify({ summary: "Une story de cuisine." }),
  });

  expect(summaries.get(entry.user_key)).toBe("Une story de cuisine.");
  expect(readFeedSummaries(report, repository)).toStrictEqual(summaries);
});

test("a changed model requires its own summary for both reading and generation", async () => {
  const { entry, report, repository } = await createStoredSummary();
  const options = { repository, model: "new-model" };
  expect(readUserSummaries(report.output.users, options).size).toBe(0);
  const summaries = await resolveUserSummariesForReport(report, {
    ...options,
    logger: createMockLogger(),
    runUserSummary: async () => JSON.stringify({ summary: "Résumé du nouveau modèle." }),
  });

  expect(summaries.get(entry.user_key)).toBe("Résumé du nouveau modèle.");
  expect(readUserSummaries(report.output.users, options)).toStrictEqual(summaries);
  expect(readFeedSummaries(report, repository).get(entry.user_key)).toBe("Résumé initial.");
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

    expect(summaries.size).toBe(1);
    expect(repository.entries.size).toBe(0);
    expect(readFeedSummaries(report, repository).size).toBe(0);
  });
}
