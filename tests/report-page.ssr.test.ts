import { beforeAll, expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { z } from "zod";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { type JsonValue, JsonValueSchema } from "../sdk/lib/json-value.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { Route } from "../server/pages/report.tsx";
import { loadReport } from "../server/report-handler.tsx";
import { storyItem } from "./mock-helpers.ts";
import { createPageRenderer } from "./render-page.ts";
import { readRecordedPayloads, seedRecordedStories } from "./setup/seed.ts";

const now = new Date("2026-10-29T12:00:00.000Z");
const threeDaysLater = new Date("2026-11-01T12:00:00.000Z");
const HOUR = 3600;
const publishedDay = "2026-10-29";
const emptyDay = "2026-10-28";
const imageStoryPk = "700000000000079";
const captionedStoryPk = "700000000000116";
const musicStoryPk = "700000000000900";
const accessibilityCaption = "A synthetic accessibility caption";
const hostileCaption = "</script><script>window.__probe = 1</script>";
const todayHeading = "Stories des dernières 24 heures";
const emptyTodayText = "Aucune story publiée dans les dernières 24 heures.";
const emptyDayText = "Aucune story publiée ce jour-là.";

const ReelsPageSchema = z.looseObject({
  data: z.looseObject({
    xdt_api__v1__feed__reels_media__connection: z.looseObject({
      edges: z.array(
        z.looseObject({
          node: z.looseObject({
            items: z.array(z.looseObject({ pk: z.string() })),
          }),
        }),
      ),
    }),
  }),
});

/** The recorded payloads with captions the recordings lack, so they travel through real ingestion. */
async function recordedPayloadsWithCaptions(captions: Partial<Record<string, string>>) {
  const recorded = await readRecordedPayloads();
  const galleryPages = recorded.galleryPages.map((payload): JsonValue => {
    const page = ReelsPageSchema.parse(payload);
    for (const { node } of page.data.xdt_api__v1__feed__reels_media__connection.edges) {
      for (const item of node.items) {
        const caption = captions[item.pk];
        if (caption !== undefined) {
          item.accessibility_caption = caption;
        }
      }
    }
    return JsonValueSchema.parse(page);
  });
  return { ...recorded, galleryPages };
}

function readDocument(html: string) {
  return new JSDOM(html).window.document;
}

/** The data the server embeds so the browser can hydrate, which includes what the lightbox shows. */
function readHydrationData(html: string): string {
  return readDocument(html).querySelector("script[data-tsr-stream-part]")?.textContent ?? "";
}

/** The report the handler loads from the seeded database, with the arguments the real loader receives. */
function createRenderer(at: Date) {
  return createPageRenderer(
    Route,
    ({ deps, context }) => loadReport(at, deps.date, context.selectedStory),
    "/report",
  );
}

async function render(url: string, at: Date = now) {
  const html = await createRenderer(at).renderRoute(url);
  const document = readDocument(html);
  return { document, html, page: within(document.body) };
}

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories(
    await recordedPayloadsWithCaptions({
      [imageStoryPk]: accessibilityCaption,
      [captionedStoryPk]: hostileCaption,
    }),
    { publishedBefore: { now, seconds: HOUR } },
  );
});

test("today's feed lists the seeded accounts with their story previews and sidebar", async () => {
  const { document, page } = await render("/report");

  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(page.getByRole("heading", { name: todayHeading, level: 1 })).toBeDefined();
  expect(page.getByText("Fil chargé le 29 octobre 2026 à 13:00 UTC+1")).toBeDefined();
  expect(page.queryByText(emptyTodayText)).toBeNull();
  expect(page.getAllByRole("heading", { level: 2 }).map(({ textContent }) => textContent)).toEqual([
    "Fixture text 69",
    "Fixture text 63",
    "Fixture text 5",
  ]);
  for (const mediaPk of [imageStoryPk, captionedStoryPk, musicStoryPk]) {
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
});

test("the page carries the seeded captions, stickers and music for the lightbox", async () => {
  const { html } = await render(`/report?story=${imageStoryPk}`);
  const data = readHydrationData(html);

  expect(data).toContain(`ig_caption:"${accessibilityCaption}"`);
  expect(data).toContain('kind:"mention",title:"@user_114"');
  expect(data).toContain('label:"Fixture audio title 1 - Fixture audio artist 1"');
});

test("a hostile caption is escaped in the page and cannot add a script", async () => {
  const { document, html } = await render("/report");
  const withoutStories = await render(`/report?date=${emptyDay}`);

  expect(html).not.toContain(hostileCaption);
  expect(html).not.toContain("<script>window.__probe");
  expect(readHydrationData(html)).toContain("\\x3C/script>\\x3Cscript>window.__probe = 1");
  // The caption adds no script element to the markup the feed's own scripts produce.
  expect(document.querySelectorAll("script")).toHaveLength(
    withoutStories.document.querySelectorAll("script").length,
  );
});

test("a past day lists the stories published that day, and today drops out of the rolling window", async () => {
  const day = await render(`/report?date=${publishedDay}`, threeDaysLater);
  const today = await render("/report", threeDaysLater);

  expect(
    day.page.getByRole("heading", { name: "Stories du 29 octobre 2026", level: 1 }),
  ).toBeDefined();
  expect(day.page.queryByText(/Fil chargé le/u)).toBeNull();
  expect(day.page.queryByText(emptyDayText)).toBeNull();
  expect(
    day.page.getAllByRole("heading", { level: 2 }).map(({ textContent }) => textContent),
  ).toEqual(["Fixture text 69", "Fixture text 63", "Fixture text 5"]);
  expect(day.page.getByRole("button", { name: `Ouvrir aperçu ${imageStoryPk}` })).toBeDefined();
  expect(today.page.getByRole("heading", { name: todayHeading, level: 1 })).toBeDefined();
  expect(today.page.getByText(emptyTodayText)).toBeDefined();
  expect(today.page.queryByRole("button", { name: /Ouvrir aperçu/u })).toBeNull();
});

test("a day without stories renders its empty state", async () => {
  const { page } = await render(`/report?date=${emptyDay}`);

  expect(page.getByRole("heading", { name: "Stories du 28 octobre 2026", level: 1 })).toBeDefined();
  expect(page.getByText(emptyDayText)).toBeDefined();
  expect(page.queryByRole("button", { name: /Ouvrir aperçu/u })).toBeNull();
  expect(page.queryAllByRole("heading", { level: 2 })).toEqual([]);
});

test("report SSR isolates loader data between concurrent requests", async () => {
  const [today, empty] = await Promise.all([render("/report"), render(`/report?date=${emptyDay}`)]);

  expect(today.page.getAllByRole("heading", { level: 2 })).toHaveLength(3);
  expect(today.page.queryByText(emptyDayText)).toBeNull();
  expect(empty.page.getByText(emptyDayText)).toBeDefined();
  expect(empty.page.queryAllByRole("heading", { level: 2 })).toEqual([]);
});

test("the page serializes hydration data for the browser", async () => {
  const { document, html } = await render(`/report?story=${imageStoryPk}`);

  expect(html).toContain("$_TSR");
  expect(document.querySelector('link[href^="/css/"]')).toBeNull();
  expect(document.querySelector('script[type="application/json"]')).toBeNull();
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

    const { html, page } = await render(`/report?date=2026-01-15&story=${mediaPk}`);

    expect(page.getByRole("button", { name: `Ouvrir aperçu ${mediaPk}` })).toBeDefined();
    expect(html).toContain(mediaPk);
  });
}
