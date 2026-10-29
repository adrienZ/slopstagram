import { assert, test, expect, type TestContext } from "vitest";
import { createReportViewModel } from "../server/report-view-model.ts";
import { userSummaries } from "../sdk/entities/user-summary.ts";
import { AppleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { VisionRepository } from "../sdk/repositories/vision-repository.ts";
import { readUserSummaries, resolveUserSummariesForReport } from "../sdk/user-summary.ts";
import { createMockLogger, createSummaryReport } from "./mock-helpers.ts";
import { createSummaryFixtures } from "./test-database.ts";

async function createStoredSummary(context: TestContext) {
  const report = createSummaryReport();
  const { database, repository } = await createSummaryFixtures(context, [
    "summaryuser",
    "mismatched",
  ]);
  await resolveUserSummariesForReport(report, {
    logger: createMockLogger(),
    repository,
    runUserSummary: async () => JSON.stringify({ summary: "Résumé initial." }),
  });
  const stored = database.select().from(userSummaries).get();
  assert.ok(stored);
  const entry = repository.findBySourceHash(stored.sourceHash);
  assert.ok(entry);
  return {
    entry,
    feed: () =>
      createReportViewModel(report.output.users, {
        appleVision: new AppleVisionRepository(database),
        userSummary: repository,
        vision: new VisionRepository(database),
      }).userSummaryByUserKey,
    report,
    repository,
  };
}

test("feed and collection normalize stored summaries identically without rewriting them", async (context) => {
  const { entry, feed, report, repository } = await createStoredSummary(context);
  const storedResult = "  Cafe\u0301\n  et\tmarche\u0301.  ";
  await repository.save({ ...entry, result: storedResult });
  const feedSummaries = feed();
  const collectionSummaries = await resolveUserSummariesForReport(report, {
    logger: createMockLogger(),
    repository,
    runUserSummary: async () => {
      expect.unreachable("a usable stored summary must not be regenerated");
    },
  });

  expect(feedSummaries.get(entry.user_key)).toBe("Café et marché.");
  expect(collectionSummaries).toStrictEqual(feedSummaries);
  expect(repository.findBySourceHash(entry.source_hash)?.result).toBe(storedResult);
});

for (const [name, result] of [
  ["empty", ""],
  ["whitespace", " \n\t "],
  ["unavailable", "résumé indisponible"],
  ["decomposed Unicode and repeated whitespace", "  re\u0301sume\u0301\n  indisponible  "],
]) {
  test(`feed hides and collection regenerates a matching ${name} summary`, async (context) => {
    const { entry, feed, report, repository } = await createStoredSummary(context);
    await repository.save({ ...entry, result });
    expect(feed().size).toBe(0);
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
    expect(feed()).toStrictEqual(summaries);
  });
}

// A summary is looked up by its source hash, so a stored one can only mismatch on these fields.
for (const field of ["prompt_hash", "user_key"] as const) {
  test(`feed and collection reject a stored summary with a mismatched ${field}`, async (context) => {
    const { entry, feed, report, repository } = await createStoredSummary(context);
    await repository.save({ ...entry, [field]: "mismatched" });
    expect(feed().size).toBe(0);
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
    expect(feed()).toStrictEqual(summaries);
  });
}

test("changed story content hides the old summary until collection regenerates it", async (context) => {
  const { entry, feed, report, repository } = await createStoredSummary(context);
  report.output.users[0].stories[0].stickers.push("#food");
  expect(feed().size).toBe(0);
  const summaries = await resolveUserSummariesForReport(report, {
    logger: createMockLogger(),
    repository,
    runUserSummary: async () => JSON.stringify({ summary: "Une story de cuisine." }),
  });

  expect(summaries.get(entry.user_key)).toBe("Une story de cuisine.");
  expect(feed()).toStrictEqual(summaries);
});

test("a changed model requires its own summary for both reading and generation", async (context) => {
  const { entry, feed, report, repository } = await createStoredSummary(context);
  const options = { repository, model: "new-model" };
  expect(readUserSummaries(report.output.users, options).size).toBe(0);
  const summaries = await resolveUserSummariesForReport(report, {
    ...options,
    logger: createMockLogger(),
    runUserSummary: async () => JSON.stringify({ summary: "Résumé du nouveau modèle." }),
  });

  expect(summaries.get(entry.user_key)).toBe("Résumé du nouveau modèle.");
  expect(readUserSummaries(report.output.users, options)).toStrictEqual(summaries);
  expect(feed().get(entry.user_key)).toBe("Résumé initial.");
});

for (const outcome of ["empty", "error"] as const) {
  test(`a generation ${outcome} leaves no stored summary for the feed`, async (context) => {
    const report = createSummaryReport();
    const { countSummaries, database, repository } = await createSummaryFixtures(context);
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
    expect(countSummaries()).toBe(0);
    expect(
      createReportViewModel(report.output.users, {
        appleVision: new AppleVisionRepository(database),
        userSummary: repository,
        vision: new VisionRepository(database),
      }).userSummaryByUserKey.size,
    ).toBe(0);
  });
}
