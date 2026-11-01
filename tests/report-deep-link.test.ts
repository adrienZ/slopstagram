import { beforeAll, expect, test } from "vitest";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { loadReport } from "../server/report-handler.tsx";
import { storyItem } from "./mock-helpers.ts";
import { readRecordedPayloads, seedRecordedStories } from "./setup/seed.ts";

const publishedAt = new Date("2026-10-29T12:00:00.000Z");
// Three days after the seeded stories, they belong to a past day instead of the rolling window.
const now = new Date("2026-11-01T12:00:00.000Z");
const publishedDay = "2026-10-29";
const today = "2026-11-01";
const seededStoryPk = "700000000000079";
const unknownStoryPk = "700000000000999";
const olderDay = "2026-10-20";
const olderStoryPk = "700000000000901";
const bigNumericPks = ["12345", "12345678901234568000", "12345678901234567890"];
const owner = { pk: "700000000000900", username: "user_900" };

async function saveStory(pk: string, isoDate: string) {
  await storyRepository.save(
    { ...storyItem(pk), taken_at: Date.parse(`${isoDate}T10:00:00Z`) / 1000 },
    owner,
  );
}

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories(await readRecordedPayloads(), {
    publishedBefore: { now: publishedAt, seconds: 3600 },
  });
  await instagramUserRepository.save({ ...owner, full_name: null, id: owner.pk });
  await saveStory(olderStoryPk, olderDay);
  await Promise.all(
    bigNumericPks.map(async (pk) => {
      await saveStory(pk, "2026-01-15");
    }),
  );
});

// The report route redirects to `/report?date=<selectedDate>&story=<story>` whenever the
// loaded `selectedDate` differs from the requested day, so the day `loadReport` selects for a
// story is what a story deep link lands on.

test("opening a story from a past day selects that day", () => {
  expect(loadReport(now, undefined, seededStoryPk).selectedDate).toBe(publishedDay);
  expect(loadReport(now, undefined, olderStoryPk).selectedDate).toBe(olderDay);
});

test("a story requested with the wrong day selects the day it was published", () => {
  expect(loadReport(now, olderDay, seededStoryPk).selectedDate).toBe(publishedDay);
});

test("a story already on the requested day keeps that day and its feed", () => {
  const report = loadReport(now, publishedDay, seededStoryPk);

  expect(report.selectedDate).toBe(publishedDay);
  expect(report.users.flatMap(({ stories }) => stories).map(({ mediaPk }) => mediaPk)).toContain(
    seededStoryPk,
  );
});

test("a story id that exists nowhere falls back to today", () => {
  const report = loadReport(now, undefined, unknownStoryPk);

  expect(report.selectedDate).toBe(today);
  expect(report.today).toBe(today);
});

test("an unknown story keeps the requested day", () => {
  expect(loadReport(now, publishedDay, unknownStoryPk).selectedDate).toBe(publishedDay);
});

for (const pk of bigNumericPks) {
  test(`numeric story id ${pk} is found as a string`, () => {
    expect(loadReport(now, undefined, pk).selectedDate).toBe("2026-01-15");
  });
}
