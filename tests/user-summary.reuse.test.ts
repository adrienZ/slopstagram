import { assert, test, expect, type TestContext } from "vitest";
import { readStoryFeedSources } from "../app/loaders/story-feed.ts";
import { userSummaries } from "@@/core/database/entities/user-summary.ts";
import { readUserSummaries, resolveUserSummariesForReport } from "@@/core/accounts/user-summary.ts";
import { createSummaryReport, withOllamaSummaries } from "./mock-helpers.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";
import { countSummaries, saveSummaryUsers } from "./test-database.ts";

async function createStoredSummary(context: TestContext) {
  const report = createSummaryReport();
  const runtime = await createTestRuntime(context);
  await saveSummaryUsers(runtime, ["summaryuser", "mismatched"]);
  await resolveUserSummariesForReport(
    withOllamaSummaries(runtime, () => JSON.stringify({ summary: "Résumé initial." })),
    report,
  );
  const stored = runtime.database.select().from(userSummaries).get();
  assert.ok(stored);
  const entry = runtime.summaries.findBySourceHash(stored.sourceHash);
  assert.ok(entry);
  return {
    entry,
    feed: () => readStoryFeedSources(runtime, report.output.users).userSummaryByUserKey,
    report,
    runtime,
  };
}

test("feed and collection normalize stored summaries identically without rewriting them", async (context) => {
  const { entry, feed, report, runtime } = await createStoredSummary(context);
  const storedResult = "  Cafe\u0301\n  et\tmarche\u0301.  ";
  await runtime.summaries.save({ ...entry, result: storedResult });
  const feedSummaries = feed();
  const collectionSummaries = await resolveUserSummariesForReport(
    withOllamaSummaries(runtime, () => {
      expect.unreachable("a usable stored summary must not be regenerated");
    }),
    report,
  );

  expect(feedSummaries.get(entry.user_key)).toBe("Café et marché.");
  expect(collectionSummaries).toStrictEqual(feedSummaries);
  expect(runtime.summaries.findBySourceHash(entry.source_hash)?.result).toBe(storedResult);
});

for (const [name, result] of [
  ["empty", ""],
  ["whitespace", " \n\t "],
  ["unavailable", "résumé indisponible"],
  ["decomposed Unicode and repeated whitespace", "  re\u0301sume\u0301\n  indisponible  "],
]) {
  test(`feed hides and collection regenerates a matching ${name} summary`, async (context) => {
    const { entry, feed, report, runtime } = await createStoredSummary(context);
    await runtime.summaries.save({ ...entry, result });
    expect(feed().size).toBe(0);
    let generations = 0;
    const summaries = await resolveUserSummariesForReport(
      withOllamaSummaries(runtime, () => {
        generations += 1;
        return JSON.stringify({ summary: "Résumé régénéré." });
      }),
      report,
    );

    expect(generations).toBe(1);
    expect(summaries.get(entry.user_key)).toBe("Résumé régénéré.");
    expect(feed()).toStrictEqual(summaries);
  });
}

// A summary is looked up by its source hash, so a stored one can only mismatch on these fields.
for (const field of ["prompt_hash", "user_key"] as const) {
  test(`feed and collection reject a stored summary with a mismatched ${field}`, async (context) => {
    const { entry, feed, report, runtime } = await createStoredSummary(context);
    await runtime.summaries.save({ ...entry, [field]: "mismatched" });
    expect(feed().size).toBe(0);
    let generations = 0;
    const summaries = await resolveUserSummariesForReport(
      withOllamaSummaries(runtime, () => {
        generations += 1;
        return JSON.stringify({ summary: "Résumé corrigé." });
      }),
      report,
    );

    expect(generations).toBe(1);
    expect(summaries.get(entry.user_key)).toBe("Résumé corrigé.");
    expect(feed()).toStrictEqual(summaries);
  });
}

test("changed story content hides the old summary until collection regenerates it", async (context) => {
  const { entry, feed, report, runtime } = await createStoredSummary(context);
  report.output.users[0].stories[0].stickers.push("#food");
  expect(feed().size).toBe(0);
  const summaries = await resolveUserSummariesForReport(
    withOllamaSummaries(runtime, () => JSON.stringify({ summary: "Une story de cuisine." })),
    report,
  );

  expect(summaries.get(entry.user_key)).toBe("Une story de cuisine.");
  expect(feed()).toStrictEqual(summaries);
});

test("a changed model requires its own summary for both reading and generation", async (context) => {
  const { entry, feed, report, runtime } = await createStoredSummary(context);
  const options = { model: "new-model" };
  expect(readUserSummaries(runtime, report.output.users, options).size).toBe(0);
  const summaries = await resolveUserSummariesForReport(
    withOllamaSummaries(runtime, () => JSON.stringify({ summary: "Résumé du nouveau modèle." })),
    report,
    options,
  );

  expect(summaries.get(entry.user_key)).toBe("Résumé du nouveau modèle.");
  expect(readUserSummaries(runtime, report.output.users, options)).toStrictEqual(summaries);
  expect(feed().get(entry.user_key)).toBe("Résumé initial.");
});

for (const outcome of ["empty", "error"] as const) {
  test(`a generation ${outcome} leaves no stored summary for the feed`, async (context) => {
    const report = createSummaryReport();
    const runtime = await createTestRuntime(context);
    await saveSummaryUsers(runtime);
    const summaries = await resolveUserSummariesForReport(
      withOllamaSummaries(runtime, () => {
        if (outcome === "error") {
          throw new Error("model unavailable");
        }
        return "";
      }),
      report,
    );

    expect(summaries.size).toBe(1);
    expect(countSummaries(runtime)).toBe(0);
    expect(readStoryFeedSources(runtime, report.output.users).userSummaryByUserKey.size).toBe(0);
  });
}
