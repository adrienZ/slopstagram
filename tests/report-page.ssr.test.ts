import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { Route } from "@/routes/report.tsx";
import { loadStoryFeed } from "@/loaders/story-feed.ts";
import { storyItem } from "@@/tests/mock-helpers.ts";
import { createPageRenderer } from "@@/tests/render-page.ts";
import { readRecordedPayloads, seedRecordedStories } from "@@/tests/setup/seed.ts";
import { createTestRuntime, useSharedTestRuntime } from "@@/tests/setup/test-runtime.ts";

const now = new Date("2026-10-29T12:00:00.000Z");
const HOUR = 3600;
const emptyDay = "2026-10-28";
const emptyDayText = "Aucune story publiée ce jour-là.";

const shared = useSharedTestRuntime(async (runtime) => {
  await seedRecordedStories(runtime, await readRecordedPayloads(), {
    publishedBefore: { now, seconds: HOUR },
  });
});

// The report the handler loads from the runtime's database, with the arguments the real loader receives.
async function renderFeed(runtime: Runtime, url: string) {
  const renderer = createPageRenderer(
    Route,
    ({ deps, context }) => loadStoryFeed(runtime, now, deps.date, context.selectedStory),
    "/report",
  );
  return await renderer.renderRoute(url);
}

function readDocument(html: string) {
  return new JSDOM(html).window.document;
}

test("today's feed lists the seeded accounts with their story previews and sidebar", async () => {
  const html = await renderFeed(shared.runtime, "/report");
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
    renderFeed(shared.runtime, "/report"),
    renderFeed(shared.runtime, `/report?date=${emptyDay}`),
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
  test(`SSR preserves numeric Instagram ID ${mediaPk} without precision loss`, async (context) => {
    const runtime = await createTestRuntime(context);
    const takenAt = Date.parse("2026-01-15T10:00:00Z") / 1000;
    const owner = { pk: "700000000000900", username: "user_900" };
    await runtime.users.save({ ...owner, full_name: null, id: owner.pk });
    await runtime.stories.save({ ...storyItem(mediaPk), taken_at: takenAt }, owner);

    const html = await renderFeed(runtime, `/report?date=2026-01-15&story=${mediaPk}`);

    expect(
      within(readDocument(html).body).getByRole("button", { name: `Ouvrir aperçu ${mediaPk}` }),
    ).toBeDefined();
    expect(html).toContain(mediaPk);
  });
}
