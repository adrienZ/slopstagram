import { beforeAll, expect, test } from "vitest";
import { createMemoryHistory } from "@tanstack/react-router";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { getRouter } from "../server/router.tsx";
import { createInProcessQueries } from "./in-process-queries.ts";
import { storyItem } from "./mock-helpers.ts";
import { renderApp } from "./render-app.ts";
import { seedRecordedStories } from "./seed.ts";

const publishedAt = new Date("2026-10-29T12:00:00.000Z");
// Three days after the seeded stories, they belong to a past day instead of the rolling window.
const now = new Date("2026-11-01T12:00:00.000Z");
const publishedDay = "2026-10-29";
const today = "2026-11-01";
const seededStoryPk = "700000000000002";
const unknownStoryPk = "700000000000999";
const olderDay = "2026-10-20";
const olderStoryPk = "700000000000901";
const bigNumericPks = ["12345", "12345678901234568000", "12345678901234567890"];
const owner = { pk: "700000000000900", username: "user_900" };

function takenAt(isoDate: string): number {
  return Date.parse(`${isoDate}T10:00:00Z`) / 1000;
}

async function saveStory(pk: string, isoDate: string) {
  await storyRepository.save({ ...storyItem(pk), taken_at: takenAt(isoDate) }, owner);
}

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories(undefined, { publishedBefore: { now: publishedAt, seconds: 3600 } });
  await instagramUserRepository.save({ ...owner, full_name: null, id: owner.pk });
  await saveStory(olderStoryPk, olderDay);
  await Promise.all(
    bigNumericPks.map(async (pk) => {
      await saveStory(pk, "2026-01-15");
    }),
  );
});

async function render(url: string) {
  const response = await renderApp(url, createInProcessQueries(now));
  const {
    window: { document },
  } = new JSDOM(await response.text());
  return { page: within(document.body), response };
}

/** A router running the way it does in the browser, over memory history, with the real route tree. */
async function openInBrowser(url: string) {
  const context = { queries: createInProcessQueries(now) };
  const router = getRouter(context);
  router.update({
    context,
    history: createMemoryHistory({ initialEntries: [url] }),
    isServer: false,
    // Scroll restoration and the origin read the browser's window and history.
    origin: "http://localhost",
    scrollRestoration: false,
  });
  await router.load();
  return router;
}

type BrowserRouter = Awaited<ReturnType<typeof openInBrowser>>;

function selectedDateOf(router: BrowserRouter) {
  const data = router.state.matches.at(-1)?.loaderData;
  return data !== undefined && "selectedDate" in data ? data.selectedDate : undefined;
}

/** The search the route validated, which is what the page reads. The raw location keeps small ids as numbers. */
function searchOf(router: BrowserRouter) {
  return router.state.matches.at(-1)?.search;
}

test("opening a story from a past day redirects to that day, which renders the story", async () => {
  const { response } = await render(`/report?story=${seededStoryPk}`);

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    `/report?date=${publishedDay}&story=${seededStoryPk}`,
  );

  const day = await render(response.headers.get("location") ?? "");
  expect(day.response.status).toBe(200);
  expect(
    day.page.getByRole("heading", { name: "Stories du 29 octobre 2026", level: 1 }),
  ).toBeDefined();
  expect(day.page.getByRole("button", { name: `Ouvrir aperçu ${seededStoryPk}` })).toBeDefined();
});

test("a story requested with the wrong day is moved to the day it was published", async () => {
  const { response } = await render(`/report?date=${olderDay}&story=${seededStoryPk}`);

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    `/report?date=${publishedDay}&story=${seededStoryPk}`,
  );
});

test("a story already on the requested day is not redirected", async () => {
  const { page, response } = await render(`/report?date=${publishedDay}&story=${seededStoryPk}`);

  expect(response.status).toBe(200);
  expect(page.getByRole("heading", { name: "Stories du 29 octobre 2026", level: 1 })).toBeDefined();
});

test("a story id that exists nowhere falls back to today without a redirect", async () => {
  const { page, response } = await render(`/report?story=${unknownStoryPk}`);

  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(
    page.getByRole("heading", { name: "Stories des dernières 24 heures", level: 1 }),
  ).toBeDefined();
  expect(page.queryByRole("dialog")).toBeNull();
});

test("an unknown story keeps the requested day", async () => {
  const { page, response } = await render(`/report?date=${publishedDay}&story=${unknownStoryPk}`);

  expect(response.status).toBe(200);
  expect(page.getByRole("heading", { name: "Stories du 29 octobre 2026", level: 1 })).toBeDefined();
});

for (const pk of bigNumericPks) {
  test(`numeric story id ${pk} reaches the loader and the redirect as a string`, async () => {
    const { response } = await render(`/report?story=${pk}`);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`/report?date=2026-01-15&story=${pk}`);
  });

  test(`numeric story id ${pk} survives a client side deep link`, async () => {
    const router = await openInBrowser(`/report?story=${pk}`);

    expect(searchOf(router)).toEqual({ date: "2026-01-15", story: pk });
    expect(selectedDateOf(router)).toBe("2026-01-15");
  });
}

test("a browser opening a deep link lands on the story's day", async () => {
  const router = await openInBrowser(`/report?story=${seededStoryPk}`);

  expect(router.state.location.href).toBe(`/report?date=${publishedDay}&story=${seededStoryPk}`);
  expect(selectedDateOf(router)).toBe(publishedDay);
});

test("navigating from one story day to a story of another day selects that day", async () => {
  const router = await openInBrowser(`/report?date=${publishedDay}`);
  expect(selectedDateOf(router)).toBe(publishedDay);

  await router.navigate({ to: "/report", search: { story: olderStoryPk } });

  expect(router.state.location.href).toBe(`/report?date=${olderDay}&story=${olderStoryPk}`);
  expect(selectedDateOf(router)).toBe(olderDay);
});

test("navigating to a story of the day already shown keeps that day", async () => {
  const router = await openInBrowser(`/report?date=${publishedDay}`);

  await router.navigate({ to: "/report", search: { date: publishedDay, story: seededStoryPk } });

  expect(router.state.location.href).toBe(`/report?date=${publishedDay}&story=${seededStoryPk}`);
  expect(selectedDateOf(router)).toBe(publishedDay);
});

test("navigating to an unknown story keeps the day shown", async () => {
  const router = await openInBrowser(`/report?date=${publishedDay}`);

  await router.navigate({ to: "/report", search: { date: publishedDay, story: unknownStoryPk } });

  expect(searchOf(router)).toEqual({ date: publishedDay, story: unknownStoryPk });
  expect(selectedDateOf(router)).toBe(publishedDay);
});

// The loader depends on the date only, so the lightbox opening and cycling stories does not
// fetch the feed again. The consequence is that a client navigation which only adds a story to
// today's feed is not redirected. No in-app link does that: the lightbox only opens stories of the
// feed on screen, and a story link from outside loads the page, which does redirect.
test("adding a story of a past day to today's feed on the client does not reload the feed", async () => {
  const router = await openInBrowser("/report");
  expect(selectedDateOf(router)).toBe(today);

  await router.navigate({ to: "/report", search: { story: seededStoryPk } });

  expect(searchOf(router)).toEqual({ story: seededStoryPk });
  expect(selectedDateOf(router)).toBe(today);
});
