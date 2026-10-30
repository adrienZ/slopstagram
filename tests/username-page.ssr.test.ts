import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { z } from "zod";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { type JsonValue, JsonValueSchema } from "../sdk/lib/json-value.ts";
import { VISION_MODEL, VISION_PROMPT } from "../sdk/lib/vision-analysis-service.ts";
import { appleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import { createInProcessQueries } from "./in-process-queries.ts";
import { renderApp } from "./render-app.ts";
import { readRecordedPayloads, seedRecordedStories } from "./seed.ts";

const now = new Date("2026-10-29T12:00:00.000Z");
const HOUR = 3600;
const DAY = 24 * HOUR;
const account = "user_075";
const laterStoryPk = "700000000000053";
const earlierStoryPk = "700000000000028";
const promptHash = createHash("sha256").update(VISION_PROMPT).digest("hex");

const ReelsPageSchema = z.looseObject({
  data: z.looseObject({
    xdt_api__v1__feed__reels_media__connection: z.looseObject({
      edges: z.array(
        z.looseObject({
          node: z.looseObject({
            items: z.array(z.looseObject({ pk: z.string(), taken_at: z.number() })),
          }),
        }),
      ),
    }),
  }),
});

/** The recorded payloads with one story moved to an earlier day, so the account spans two days. */
async function recordedPayloadsWithEarlierStory(pk: string) {
  const recorded = await readRecordedPayloads();
  const galleryPages = recorded.galleryPages.map((payload): JsonValue => {
    const page = ReelsPageSchema.parse(payload);
    for (const { node } of page.data.xdt_api__v1__feed__reels_media__connection.edges) {
      for (const item of node.items) {
        if (item.pk === pk) {
          item.taken_at -= 2 * DAY;
        }
      }
    }
    return JsonValueSchema.parse(page);
  });
  return { ...recorded, galleryPages };
}

async function render(url: string) {
  const response = await renderApp(url, createInProcessQueries(now));
  const html = await response.text();
  const { document } = new JSDOM(html).window;
  return { document, html, page: within(document.body), response };
}

/** The data the server embeds so the browser can hydrate, which includes what the lightbox shows. */
function readHydrationData(html: string): string {
  return (
    new JSDOM(html).window.document.querySelector("script[data-tsr-stream-part]")?.textContent ?? ""
  );
}

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories(await recordedPayloadsWithEarlierStory(earlierStoryPk), {
    publishedBefore: { now, seconds: HOUR },
  });
  await instagramUserRepository.save({
    full_name: null,
    id: "700000000000901",
    pk: "700000000000901",
    username: "user_901",
  });
  await visionRepository.save(laterStoryPk, {
    model: VISION_MODEL,
    prompt_hash: promptHash,
    result: {
      text: "Current synthetic OCR text",
      visual: "Current synthetic description",
    },
  });
  await visionRepository.save(earlierStoryPk, {
    model: "retired-model",
    prompt_hash: promptHash,
    result: {
      text: "Outdated synthetic OCR text",
      visual: "Outdated synthetic description",
    },
  });
  await appleVisionRepository.save(laterStoryPk, "Synthetic Apple caption");
});

test("an account's stories are grouped by the day they were published", async () => {
  const { page, response } = await render(`/users/${account}`);

  expect(response.status).toBe(200);
  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(page.getByRole("heading", { name: `@${account}`, level: 1 })).toBeDefined();
  expect(page.getByText("2 storys · dates de publication")).toBeDefined();
  const gallery = within(page.getByRole("region", { name: "Galerie des stories" }));
  expect(gallery.getByRole("heading", { name: "2026", level: 2 })).toBeDefined();
  expect(gallery.getByRole("heading", { name: "octobre", level: 3 })).toBeDefined();
  // Newest day first, each day holding the stories published that day.
  expect(
    gallery.getAllByRole("heading", { level: 4 }).map(({ textContent }) => textContent),
  ).toEqual(["29 octobre 2026", "27 octobre 2026"]);
  const laterDay = within(gallery.getByRole("region", { name: "2026-10-29" }));
  const earlierDay = within(gallery.getByRole("region", { name: "2026-10-27" }));
  expect(laterDay.getByRole("button", { name: `Ouvrir aperçu ${laterStoryPk}` })).toBeDefined();
  expect(laterDay.queryByRole("button", { name: `Ouvrir aperçu ${earlierStoryPk}` })).toBeNull();
  expect(earlierDay.getByRole("button", { name: `Ouvrir aperçu ${earlierStoryPk}` })).toBeDefined();
  expect(page.queryByRole("dialog")).toBeNull();
});

test("the current vision result and the Apple caption are carried, an outdated vision result is not", async () => {
  const { html } = await render(`/users/${account}?story=${laterStoryPk}`);
  const data = readHydrationData(html);

  expect(data).toContain('visionOcr:"Current synthetic OCR text"');
  expect(data).toContain('visionDescription:"Current synthetic description"');
  expect(data).toContain('appleCaption:"Synthetic Apple caption"');
  expect(data).not.toContain("Outdated synthetic");
  expect(data).not.toContain("retired-model");
});

test("an account without stories renders an empty timeline", async () => {
  const { page, response } = await render("/users/user_901");

  expect(response.status).toBe(200);
  expect(page.getByRole("heading", { name: "@user_901", level: 1 })).toBeDefined();
  expect(page.getByText("Aucune story enregistrée pour cet utilisateur.")).toBeDefined();
  expect(page.queryAllByRole("heading", { level: 4 })).toEqual([]);
  expect(page.queryByRole("button", { name: /Ouvrir aperçu/u })).toBeNull();
});

test("an unknown account renders the not-found page", async () => {
  const { page, response } = await render("/users/unknown_account");

  expect(response.status).toBe(404);
  expect(page.getByRole("heading", { name: "404 : Page introuvable" })).toBeDefined();
  expect(page.queryByRole("main")).toBeNull();
});

test("the timeline serializes hydration data for the browser", async () => {
  const { document, html } = await render(`/users/${account}?story=${laterStoryPk}`);

  expect(html).toContain("$_TSR");
  expect(document.querySelector('script[type="application/json"]')).toBeNull();
});
