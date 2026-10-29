import { beforeAll, expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { createPageRenderer } from "./render-page.ts";
import { Route } from "../server/pages/users/$username.tsx";
import { captionedStoryPk, seedPageData } from "./seed.ts";

const renderer = createPageRenderer(Route, "/users/$username");

beforeAll(async () => {
  migrateDatabase();
  await seedPageData(new Date());
});

test("timeline SSR renders the account the loader reads and defers its selected portal until hydration", async () => {
  const response = await renderer.renderRoute(`/users/user_041?story=${captionedStoryPk}`);
  const html = await response.text();
  const { document } = new JSDOM(html).window;
  const page = within(document.body);
  expect(response.status).toBe(200);
  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(page.getByRole("heading", { name: "@user_041", level: 1 })).toBeDefined();
  // The story appears in the gallery and again under its mention sticker.
  expect(
    page.getAllByRole("button", { name: `Ouvrir aperçu ${captionedStoryPk}` }).length,
  ).toBeGreaterThan(0);
  expect(page.queryByRole("dialog")).toBeNull();
  expect(html).toContain("$_TSR");
  expect(html).not.toContain("<script>caption");
  expect(document.querySelector('script[type="application/json"]')).toBeNull();
});

test("an account without stories is a 404", async () => {
  const response = await renderer.renderRoute("/users/nobody");

  expect(response.status).toBe(404);
});
