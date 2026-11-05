import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { Route } from "../app/routes/map.tsx";
import { loadPlaceMap } from "../app/loaders/place-map.ts";
import { createPageRenderer } from "./render-page.ts";
import { useSharedTestRuntime } from "./setup/test-runtime.ts";
import { seedMapDatabase } from "./ui/seeded-pages.ts";

const shared = useSharedTestRuntime(seedMapDatabase);

test("the server renders the popover account filter, as on mobile", async () => {
  const renderer = createPageRenderer(Route, () => loadPlaceMap(shared.runtime), "/map");
  const html = await renderer.renderRoute("/map");
  const page = within(new JSDOM(html).window.document.body);
  expect(page.getAllByRole("button", { name: /Filtrer par compte/u })).toHaveLength(1);
  expect(page.queryByRole("complementary", { name: "Filtres" })).toBeNull();
});
