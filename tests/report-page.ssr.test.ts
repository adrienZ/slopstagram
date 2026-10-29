import { beforeAll, expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { getStoryDate } from "../sdk/lib/story-date-service.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { storyItem } from "./mock-helpers.ts";
import { createPageRenderer } from "./render-page.ts";
import { Route } from "../server/pages/report.tsx";
import { captionedStoryPk, PAST_STORY_AGE_SECONDS, pastStoryPk, seedPageData } from "./seed.ts";

const renderer = createPageRenderer(Route, "/report");
const owner = { pk: "700000000000188", username: "user_041" };

function readDocument(html: string) {
  return new JSDOM(html).window.document;
}

async function render(url: string) {
  const response = await renderer.renderRoute(url);
  return { response, html: await response.text() };
}

beforeAll(async () => {
  migrateDatabase();
  const now = new Date();
  await seedPageData(now);
  for (const mediaPk of ["12345", "12345678901234568000", "12345678901234567890"]) {
    // eslint-disable-next-line no-await-in-loop -- Saved one by one to keep the database writes ordered.
    await storyRepository.save(
      { ...storyItem(mediaPk), taken_at: Math.floor(now.getTime() / 1000) - 600 },
      owner,
    );
  }
});

test("report SSR renders the feed the loader reads from the database and safely serializes hydration data", async () => {
  const { response, html } = await render(`/report?story=${captionedStoryPk}`);
  const document = readDocument(html);
  const page = within(document.body);
  expect(response.status).toBe(200);
  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(page.getByRole("heading", { name: "Stories des dernières 24 heures" })).toBeDefined();
  expect(page.getByRole("heading", { name: "@user_019" })).toBeDefined();
  expect(page.getByRole("button", { name: `Ouvrir aperçu ${captionedStoryPk}` })).toBeDefined();
  expect(page.queryByRole("dialog")).toBeNull();
  expect(document.querySelector('link[href^="/css/"]')).toBeNull();
  expect(html).toContain("$_TSR");
  expect(html).not.toContain("<script>caption");
});

test("report SSR isolates loader data between concurrent requests", async () => {
  const [today, emptyDay] = await Promise.all([
    render("/report"),
    render("/report?date=2026-01-01"),
  ]);
  const todayPage = within(readDocument(today.html).body);
  const emptyDayPage = within(readDocument(emptyDay.html).body);
  expect(todayPage.getByRole("heading", { name: "@user_041" })).toBeDefined();
  expect(todayPage.queryByText("Aucune story publiée ce jour-là.")).toBeNull();
  expect(emptyDayPage.getByText("Aucune story publiée ce jour-là.")).toBeDefined();
  expect(emptyDayPage.queryByRole("heading", { name: "@user_041" })).toBeNull();
});

test("a story deep link to an older day redirects to that day with the story kept", async () => {
  const publishedDay = getStoryDate(new Date(Date.now() - PAST_STORY_AGE_SECONDS * 1000));

  const { response } = await render(`/report?story=${pastStoryPk}`);

  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.status).toBeLessThan(400);
  const location = new globalThis.URL(response.headers.get("location") ?? "", "http://localhost");
  expect(location.pathname).toBe("/report");
  expect(location.searchParams.get("date")).toBe(publishedDay);
  expect(location.searchParams.get("story")).toBe(pastStoryPk);
});

test("a story deep link that already names its day is not redirected", async () => {
  const publishedDay = getStoryDate(new Date(Date.now() - PAST_STORY_AGE_SECONDS * 1000));

  const { response, html } = await render(`/report?date=${publishedDay}&story=${pastStoryPk}`);

  expect(response.status).toBe(200);
  expect(
    within(readDocument(html).body).getByRole("button", { name: `Ouvrir aperçu ${pastStoryPk}` }),
  ).toBeDefined();
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
    const { response, html } = await render(`/report?story=${mediaPk}`);
    expect(response.status).toBe(200);
    expect(
      within(readDocument(html).body).getByRole("button", { name: `Ouvrir aperçu ${mediaPk}` }),
    ).toBeDefined();
    expect(html).toContain(mediaPk);
  });
}
