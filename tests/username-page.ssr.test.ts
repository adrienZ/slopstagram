import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { VISION_MODEL, VISION_PROMPT } from "../sdk/lib/vision-analysis-service.ts";
import { appleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import { Route } from "../server/pages/users/$username.tsx";
import { loadUserTimeline } from "../server/user-timeline-handler.tsx";
import { storyItem } from "./mock-helpers.ts";
import { createPageRenderer } from "./render-page.ts";

const now = new Date("2026-10-29T12:00:00.000Z");
const owner = { pk: "700000000000075", username: "user_075" };
const emptyOwner = { pk: "700000000000901", username: "user_901" };
const laterStoryPk = "700000000000053";
const earlierStoryPk = "700000000000028";
const promptHash = createHash("sha256").update(VISION_PROMPT).digest("hex");

// The timeline the handler loads from the seeded database, with the username the real loader receives.
const renderer = createPageRenderer(
  Route,
  ({ params }) => loadUserTimeline(params.username, now),
  "/users/$username",
);

/** The data the server embeds so the browser can hydrate, which includes what the lightbox shows. */
function readHydrationData(html: string): string {
  return (
    new JSDOM(html).window.document.querySelector("script[data-tsr-stream-part]")?.textContent ?? ""
  );
}

async function render(url: string) {
  const html = await renderer.renderRoute(url);
  return { html, page: within(new JSDOM(html).window.document.body) };
}

beforeAll(async () => {
  migrateDatabase();
  await instagramUserRepository.save({ ...owner, full_name: null, id: owner.pk });
  await instagramUserRepository.save({ ...emptyOwner, full_name: null, id: emptyOwner.pk });
  await storyRepository.save(
    { ...storyItem(laterStoryPk), taken_at: Date.parse("2026-10-29T10:00:00Z") / 1000 },
    owner,
  );
  await storyRepository.save(
    { ...storyItem(earlierStoryPk), taken_at: Date.parse("2026-10-27T10:00:00Z") / 1000 },
    owner,
  );
  await visionRepository.save(laterStoryPk, {
    model: VISION_MODEL,
    prompt_hash: promptHash,
    result: { text: "Current synthetic OCR text", visual: "Current synthetic description" },
  });
  await visionRepository.save(earlierStoryPk, {
    model: "retired-model",
    prompt_hash: promptHash,
    result: { text: "Outdated synthetic OCR text", visual: "Outdated synthetic description" },
  });
  await appleVisionRepository.save(laterStoryPk, "Synthetic Apple caption");
});

test("an account's stories are grouped by the day they were published", async () => {
  const { page } = await render(`/users/${owner.username}`);

  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(page.getByRole("heading", { name: `@${owner.username}`, level: 1 })).toBeDefined();
  expect(page.getByText("2 storys · dates de publication")).toBeDefined();
  const gallery = within(page.getByRole("region", { name: "Galerie des stories" }));
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

test("the current vision result is carried plainly, an outdated one is flagged with its model", async () => {
  const { html } = await render(`/users/${owner.username}`);
  const data = readHydrationData(html);

  expect(data).toContain('visionOcr:"Current synthetic OCR text"');
  expect(data).toContain('visionDescription:"Current synthetic description"');
  expect(data).toContain('appleCaption:"Synthetic Apple caption"');
  expect(data).toContain('visionOcr:"Outdated synthetic OCR text"');
  // Only the outdated result carries the model that produced it.
  expect(data.match(/visionOutdated:/gu)).toHaveLength(1);
  expect(data).toContain('model:"retired-model"');
});

test("an account without stories renders an empty timeline", async () => {
  const { page } = await render(`/users/${emptyOwner.username}`);

  expect(page.getByRole("heading", { name: `@${emptyOwner.username}`, level: 1 })).toBeDefined();
  expect(page.getByText("Aucune story enregistrée pour cet utilisateur.")).toBeDefined();
  expect(page.queryByRole("button", { name: /Ouvrir aperçu/u })).toBeNull();
});

test("an account the application has never seen has no timeline", () => {
  expect(() => loadUserTimeline("unknown_account", now)).toThrow(
    "no published stories found for unknown_account",
  );
});
