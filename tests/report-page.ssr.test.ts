import { beforeAll, expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { Route } from "../server/pages/report.tsx";
import { loadReport } from "../server/report-handler.tsx";
import { storyItem } from "./mock-helpers.ts";
import { createPageRenderer } from "./render-page.ts";
import { readRecordedPayloads, seedRecordedStories } from "./setup/seed.ts";

const now = new Date("2026-10-29T12:00:00.000Z");
const HOUR = 3600;
const emptyDay = "2026-10-28";
const emptyDayText = "Aucune story publiée ce jour-là.";

// The report the handler loads from the seeded database, with the arguments the real loader receives.
const renderer = createPageRenderer(
  Route,
  ({ deps, context }) => loadReport(now, deps.date, context.selectedStory),
  "/report",
);

function readDocument(html: string) {
  return new JSDOM(html).window.document;
}

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories(await readRecordedPayloads(), {
    publishedBefore: { now, seconds: HOUR },
  });
});

test("today's feed lists the seeded accounts with their story previews and sidebar", async () => {
  const html = await renderer.renderRoute("/report");
  const document = readDocument(html);
  const page = within(document.body);

  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(
    page.getByRole("heading", { name: "Stories des dernières 24 heures", level: 1 }),
  ).toBeDefined();
  expect(page.getByText("Fil chargé le 29 octobre 2026 à 13:00 UTC+1")).toBeDefined();
  expect(page.getAllByRole("heading", { level: 2 }).map(({ textContent }) => textContent)).toEqual([
    "Fixture text 69",
    "Fixture text 63",
    "Fixture text 5",
  ]);
  for (const mediaPk of ["700000000000079", "700000000000116", "700000000000900"]) {
    expect(page.getByRole("button", { name: `Ouvrir aperçu ${mediaPk}` })).toBeDefined();
    expect(page.getByAltText(`aperçu ${mediaPk}`).getAttribute("src")).toBe(
      `/media/story-previews/${mediaPk}.jpg`,
    );
  }
  for (const username of ["user_008", "user_066", "user_072"]) {
    // One link in the sidebar and one on the account's section.
    expect(document.querySelectorAll(`a[href="/users/${username}"]`)).toHaveLength(2);
  }
  expect(page.queryByRole("dialog")).toBeNull();
  expect(html).toContain("$_TSR");
});

test("report SSR isolates loader data between concurrent requests", async () => {
  const [today, empty] = await Promise.all([
    renderer.renderRoute("/report"),
    renderer.renderRoute(`/report?date=${emptyDay}`),
  ]);
  const todayPage = within(readDocument(today).body);
  const emptyPage = within(readDocument(empty).body);

  expect(todayPage.getAllByRole("heading", { level: 2 })).toHaveLength(3);
  expect(todayPage.queryByText(emptyDayText)).toBeNull();
  expect(emptyPage.getByText(emptyDayText)).toBeDefined();
  expect(emptyPage.queryAllByRole("heading", { level: 2 })).toEqual([]);
});

test("invalid report dates preserve story IDs while falling back to today", () => {
  const validate = Route.options.validateSearch;
  expect(validate).toBeDefined();
  if (!validate || !("parse" in validate)) {
    throw new Error("Missing search schema");
  }
  expect(validate.parse({ date: "2026-02-30", story: "12345678901234567890" })).toEqual({
    date: undefined,
    story: "12345678901234567890",
  });
});

for (const mediaPk of ["12345", "12345678901234568000", "12345678901234567890"]) {
  test(`SSR preserves numeric Instagram ID ${mediaPk} without precision loss`, async () => {
    const takenAt = Date.parse("2026-01-15T10:00:00Z") / 1000;
    const owner = { pk: "700000000000900", username: "user_900" };
    await instagramUserRepository.save({ ...owner, full_name: null, id: owner.pk });
    await storyRepository.save({ ...storyItem(mediaPk), taken_at: takenAt }, owner);

    const html = await renderer.renderRoute(`/report?date=2026-01-15&story=${mediaPk}`);

    expect(
      within(readDocument(html).body).getByRole("button", { name: `Ouvrir aperçu ${mediaPk}` }),
    ).toBeDefined();
    expect(html).toContain(mediaPk);
  });
}
