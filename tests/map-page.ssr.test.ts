import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { Route } from "../app/routes/map.tsx";
import { createPageData, createPageRenderer } from "./render-page.ts";
import { shareTestRuntime } from "./setup/test-runtime.ts";
import { seedMapDatabase } from "./ui/seeded-pages.ts";

const shared = shareTestRuntime(seedMapDatabase);

test("the server renders the popover account filter, as on mobile", async () => {
  const renderer = createPageRenderer(Route, () => createPageData(shared.runtime), "/map");
  const html = await renderer.renderRoute("/map");
  const page = within(new JSDOM(html).window.document.body);
  expect(page.getAllByRole("button", { name: /Filtrer par compte/u })).toHaveLength(1);
  expect(page.queryByRole("complementary", { name: "Filtres" })).toBeNull();
});
